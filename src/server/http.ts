import { createReadStream } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname } from 'node:path';
import { pipeline } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { WorldMessage, WorldSummary } from '../shared/types.js';
import type { Engine } from './engine.js';
import {
  isAllowedHost,
  isAllowedOrigin,
  isAuthorised,
  isValidNonce,
  NONCE_HEADER,
  PROOF_HEADER,
  resolveStatic,
  secretMatches,
  serverProof,
  socketToken,
  WS_PROTOCOL,
} from './security.js';
import type { ControlService } from './control.js';
import { handleControl } from './control-routes.js';

/** Server settings. */
export interface ServerOptions {
  engine: Engine;
  port: number;
  webDir: string;
  extraOrigins?: readonly string[];
  control?: ControlService;
  token: string;
}

/** A started server. */
export interface RunningServer {
  port: number;
  close: () => Promise<void>;
}

const HOST = '127.0.0.1';
const BROADCAST_THROTTLE_MS = 250;
const MAX_CLIENT_PAYLOAD = 1024;
const MAX_CLIENT_BACKLOG = 4 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Start the loopback-only HTTP + WebSocket server.
 * @param options - server settings
 * @returns the running server
 */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_CLIENT_PAYLOAD,
    handleProtocols: (protocols) => (protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false),
  });
  let port = options.port;

  const server = createServer((req, res) => {
    try {
      handleRequest(req, res, options, port);
    } catch (error) {
      process.stderr.write(`agent-world: ${req.method ?? 'GET'} ${(req.url ?? '').split('?')[0]} failed: ${(error as Error).message}\n`);
      if (!res.headersSent) reply(res, 500, { error: 'internal error' });
      else res.destroy();
    }
  });
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const allowed = req.url === '/ws' && isAllowedHost(req.headers.host, port) && isAllowedOrigin(req.headers.origin, port, options.extraOrigins);
    if (!allowed) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    if (!secretMatches(socketToken(req.headers['sec-websocket-protocol']), options.token)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(req, socket, head, (client) => {
      client.on('error', () => client.terminate());
      send(client, options);
    });
  });

  let pending: NodeJS.Timeout | null = null;
  const broadcast = (): void => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      sockets.clients.forEach((client) => send(client, options));
    }, BROADCAST_THROTTLE_MS);
  };
  const stopEngine = options.engine.onChange(broadcast);
  const stopControl = options.control?.onChange(broadcast);
  const unsubscribe = (): void => {
    stopEngine();
    stopControl?.();
  };

  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      unsubscribe();
      reject(error.code === 'EADDRINUSE' ? new Error(`port ${options.port} is in use (EADDRINUSE); pick another with --port`) : error);
    });
    server.listen(options.port, HOST, resolve);
  });
  port = (server.address() as AddressInfo).port;

  return {
    port,
    close: async () => {
      unsubscribe();
      if (pending) clearTimeout(pending);
      sockets.clients.forEach((client) => client.terminate());
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
    },
  };
}

/**
 * Send the current world to one client.
 * @param client - WebSocket client
 * @param options - server settings (engine and optional command centre)
 */
function send(client: WebSocket, options: ServerOptions): void {
  if (client.readyState !== client.OPEN || client.bufferedAmount > MAX_CLIENT_BACKLOG) return;
  const message: WorldMessage = { type: 'world', world: worldOf(options) };
  client.send(JSON.stringify(message));
}

/**
 * The world summary with the command centre's state attached when it exists.
 * @param options - server settings
 * @returns world summary
 */
function worldOf(options: ServerOptions): WorldSummary {
  const world = options.engine.summary();
  return options.control ? { ...world, control: options.control.state() } : world;
}

/**
 * Route one HTTP request: Host and Origin checks, the access token for the API, then the static UI.
 * The UI files themselves hold no data, so they load without the token.
 * @param req - request
 * @param res - response
 * @param options - server settings
 * @param port - bound port
 */
function handleRequest(req: IncomingMessage, res: ServerResponse, options: ServerOptions, port: number): void {
  if (!isAllowedHost(req.headers.host, port)) return reply(res, 403, { error: 'forbidden' });
  if (!isAllowedOrigin(req.headers.origin, port, options.extraOrigins)) return reply(res, 403, { error: 'forbidden' });
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (path.startsWith('/api/')) {
    if (!isAuthorised(req.headers, options.token)) return reply(res, 401, { error: 'unauthorised' });
    const nonce = req.headers[NONCE_HEADER];
    if (isValidNonce(nonce)) res.setHeader(PROOF_HEADER, serverProof(options.token, nonce));
    if (path === '/api/control' && req.method === 'GET') return reply(res, 200, { enabled: options.control?.enabled === true });
  }
  if (options.control && handleControl(req, res, path, { control: options.control, reply })) return;
  if (req.method !== 'GET') return reply(res, 405, { error: 'method not allowed' });

  if (path === '/api/world') return reply(res, 200, worldOf(options));
  if (path.startsWith('/api/')) return labDetail(res, options.engine, path);

  const file = resolveStatic(options.webDir, path);
  if (!file) return reply(res, 400, { error: 'bad path' });
  res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff' });
  pipeline(createReadStream(file), res, () => undefined);
}

/**
 * `GET /api/labs/:sessionId/:labId`.
 * @param res - response
 * @param engine - world engine
 * @param path - request path
 */
function labDetail(res: ServerResponse, engine: Engine, path: string): void {
  const parts = path.split('/').slice(2);
  if (parts.length !== 3 || parts[0] !== 'labs') return reply(res, 404, { error: 'not found' });
  let lab = null;
  try {
    lab = engine.lab(decodeURIComponent(parts[1] ?? ''), decodeURIComponent(parts[2] ?? ''));
  } catch {
    return reply(res, 400, { error: 'bad path' });
  }
  return lab ? reply(res, 200, lab) : reply(res, 404, { error: 'not found' });
}

/**
 * Send a JSON response.
 * @param res - response
 * @param status - HTTP status
 * @param body - JSON body
 */
function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}
