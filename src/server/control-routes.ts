import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ControlResult, ControlService } from './control.js';

const BODY_LIMIT = 64 * 1024;
const MAX_WAIT_MS = 25_000;
const REQUEST_PATH = /^\/api\/hook-requests\/([\w-]{1,100})$/;
const WAIT_PATH = /^\/api\/hook-requests\/([\w-]{1,100})\/answer$/;

/** What a control route needs. The server has already checked the access token. */
export interface ControlContext {
  control: ControlService;
  reply: (res: ServerResponse, status: number, body: unknown) => void;
}

/** Thrown when a request body is over the size limit. */
class BodyTooLarge extends Error {}

/**
 * Handle a command-centre request, if the path is one.
 * @param req - request
 * @param res - response
 * @param path - request path without query
 * @param context - control service and reply helper
 * @returns true when the request was handled here
 */
export function handleControl(req: IncomingMessage, res: ServerResponse, path: string, context: ControlContext): boolean {
  const { control, reply } = context;
  const waitMatch = WAIT_PATH.exec(path);
  if (waitMatch && req.method === 'GET') {
    const id = waitMatch[1] ?? '';
    if (!control.requests.has(id)) return reply(res, 404, { error: 'not found' }), true;
    const wait = Math.min(MAX_WAIT_MS, Math.max(0, Number(new URL(req.url ?? '', 'http://x').searchParams.get('wait')) || 0));
    const hookGone = new AbortController();
    res.on('close', () => hookGone.abort());
    void control.requests
      .wait(id, wait, hookGone.signal)
      .then((answer) => reply(res, 200, { answer }))
      .catch((error: unknown) => failed(res, reply, path, error));
    return true;
  }
  const cancelMatch = REQUEST_PATH.exec(path);
  if (cancelMatch && req.method === 'DELETE') {
    control.cancel(cancelMatch[1] ?? '');
    return reply(res, 200, { result: true }), true;
  }
  if (path === '/api/projects' && req.method === 'GET') {
    void control
      .projects()
      .then((result) => (result.ok ? reply(res, 200, { result: result.value }) : reply(res, result.status, { error: result.reason })))
      .catch((error: unknown) => failed(res, reply, path, error));
    return true;
  }
  const routes: Array<[RegExp, string, (match: RegExpMatchArray, body: Record<string, unknown>) => Promise<ControlResult<unknown>> | ControlResult<unknown>]> = [
    [/^\/api\/runs$/, 'POST', (_match, body) => control.startRun(body)],
    [/^\/api\/launches$/, 'POST', (_match, body) => control.launch(body)],
    [/^\/api\/explanations$/, 'POST', (_match, body) => control.explain(body)],
    [/^\/api\/hook-requests$/, 'POST', (_match, body) => control.raise(body)],
    [/^\/api\/requests\/([\w-]{1,100})\/answers$/, 'POST', (match, body) => control.answer(match[1] ?? '', body)],
  ];
  for (const [pattern, method, run] of routes) {
    const match = pattern.exec(path);
    if (!match) continue;
    if (req.method !== method) return reply(res, 405, { error: 'method not allowed' }), true;
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return reply(res, 415, { error: 'send JSON' }), true;
    void readJson(req)
      .then(async (body) => {
        if (!body) return reply(res, 400, { error: 'invalid JSON body' });
        const result = await run(match, body);
        return result.ok ? reply(res, 200, { result: result.value }) : reply(res, result.status, { error: result.reason });
      })
      .catch((error: unknown) => (error instanceof BodyTooLarge ? reply(res, 413, { error: 'body too large' }) : failed(res, reply, path, error)));
    return true;
  }
  return false;
}

/**
 * Log an unexpected failure and answer 500 without its details.
 * @param res - response
 * @param reply - reply helper
 * @param path - request path, for the log
 * @param error - what went wrong
 */
function failed(res: ServerResponse, reply: ControlContext['reply'], path: string, error: unknown): void {
  process.stderr.write(`agent-world: ${path} failed: ${(error as Error)?.message ?? String(error)}\n`);
  if (!res.headersSent) reply(res, 500, { error: 'internal error' });
}

/**
 * Read a JSON object body up to the size limit.
 * @param req - request
 * @returns the object, or null when it is not a JSON object
 */
function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        req.removeAllListeners('data');
        req.resume();
        reject(new BodyTooLarge('too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null);
      } catch {
        resolve(null);
      }
    });
  });
}
