import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { Engine } from '../../src/server/engine';
import { startServer, type RunningServer } from '../../src/server/http';
import type { Lab, WorldMessage, WorldSummary } from '../../src/shared/types';
import { assistantText, humanPrompt, setFixtureBase, thinking, toolResult, toolUse } from '../fixtures/lines';

setFixtureBase(Date.now() + 120_000);

const SESSION_ID = 'sess-1';
const TOKEN = '0123456789abcdef0123456789abcdef';
const PROTOCOLS = ['agent-world', `agent-world-token.${TOKEN}`];

/**
 * Serialize transcript lines as JSONL.
 * @param lines - lines
 * @returns JSONL text
 */
const jsonl = (...lines: Record<string, unknown>[]): string => lines.map((line) => `${JSON.stringify(line)}\n`).join('');

/**
 * Perform a GET request with the access token, with optional Host and token overrides.
 * @param port - server port
 * @param path - request path
 * @param host - Host header
 * @param token - access token to send, or null for none
 * @returns status and body
 */
const get = (port: number, path: string, host = `127.0.0.1:${port}`, token: string | null = TOKEN): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host, ...(token === null ? {} : { 'x-agent-world-token': token }) };
    const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });

describe('engine + server against a fixture Claude directory', () => {
  let claudeDir: string;
  let webDir: string;
  let transcript: string;
  let engine: Engine;
  let server: RunningServer;

  beforeAll(async () => {
    claudeDir = mkdtempSync(join(tmpdir(), 'claude-'));
    webDir = mkdtempSync(join(tmpdir(), 'web-'));
    writeFileSync(join(webDir, 'index.html'), '<html>agent world</html>');
    mkdirSync(join(claudeDir, 'sessions'));
    writeFileSync(
      join(claudeDir, 'sessions', `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: SESSION_ID, cwd: '/work/my-app', kind: 'interactive', entrypoint: 'cli', startedAt: 1 }),
    );
    const projectDir = join(claudeDir, 'projects', '-work-my-app');
    const subDir = join(projectDir, SESSION_ID, 'subagents');
    mkdirSync(subDir, { recursive: true });
    transcript = join(projectDir, `${SESSION_ID}.jsonl`);
    writeFileSync(
      transcript,
      jsonl(
        humanPrompt('fix the build'),
        toolUse('a1', 'Agent', { subagent_type: 'Explore', description: 'Find routes', prompt: 'Find duplicate routes' }),
        toolResult('a1', 2, { toolUseResult: { agentId: 'ag1' } }),
        toolUse('e1', 'Edit', { file_path: '/work/my-app/routes.js', old_string: 'a', new_string: 'b' }, 3),
      ),
    );
    writeFileSync(join(subDir, 'agent-ag1.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Find routes', toolUseId: 'a1', spawnDepth: 1 }));
    writeFileSync(join(subDir, 'agent-ag1.jsonl'), jsonl(thinking(2), assistantText('Found 10 duplicates', true, 4)));

    engine = new Engine({ claudeDir });
    await engine.tick();
    server = await startServer({ engine, port: 0, webDir, token: TOKEN });
  });

  afterAll(async () => {
    await server.close();
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(webDir, { recursive: true, force: true });
  });

  it('builds a continent with a lab, the main scientist and the subagent', () => {
    const world = engine.summary();
    expect(world.sessions).toHaveLength(1);
    const lab = world.sessions[0]?.labs[0];
    expect(lab?.prompt).toBe('fix the build');
    expect(lab?.scientists.map((scientist) => [scientist.id, scientist.role, scientist.status])).toEqual([
      ['main', 'main', 'working'],
      ['ag1', 'Explore', 'done'],
    ]);
  });

  it('serves the world summary', async () => {
    const response = await get(server.port, '/api/world');
    expect(response.status).toBe(200);
    expect((JSON.parse(response.body) as WorldSummary).sessions[0]?.sessionId).toBe(SESSION_ID);
  });

  it('serves a lab detail with its changes, and 404 for an unknown lab', async () => {
    const labId = engine.summary().sessions[0]?.labs[0]?.id ?? '';
    const response = await get(server.port, `/api/labs/${SESSION_ID}/${encodeURIComponent(labId)}`);
    expect(response.status).toBe(200);
    const lab = JSON.parse(response.body) as Lab;
    expect(lab.changes[0]).toMatchObject({ file: '/work/my-app/routes.js', oldText: 'a', newText: 'b' });
    expect(lab.scientists.ag1?.report).toBe('Found 10 duplicates');
    expect((await get(server.port, `/api/labs/${SESSION_ID}/nope`)).status).toBe(404);
    expect((await get(server.port, '/api/labs/only-one-part')).status).toBe(404);
  });

  it('refuses every API path without the right access token', async () => {
    for (const path of ['/api/world', '/api/control', `/api/labs/${SESSION_ID}/x`, '/api/anything']) {
      expect((await get(server.port, path, undefined, null)).status).toBe(401);
      expect((await get(server.port, path, undefined, 'wrong-token')).status).toBe(401);
    }
  });

  it('says whether the command centre is on without ever handing out the token', async () => {
    const response = await get(server.port, '/api/control');
    expect(JSON.parse(response.body)).toEqual({ enabled: false });
    expect(response.body).not.toContain(TOKEN);
  });

  it('serves the UI without the token, since it holds no data', async () => {
    expect((await get(server.port, '/', undefined, null)).status).toBe(200);
  });

  it('serves the UI and falls back to it for client routes', async () => {
    expect((await get(server.port, '/')).body).toContain('agent world');
    expect((await get(server.port, '/some/route')).body).toContain('agent world');
  });

  it('rejects a foreign Host header (DNS rebinding)', async () => {
    expect((await get(server.port, '/api/world', 'evil.example:80')).status).toBe(403);
  });

  it('rejects a malformed path', async () => {
    expect((await get(server.port, '/%E0%A4%A')).status).toBe(400);
  });

  it('pushes the world over the WebSocket to its own origin', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, PROTOCOLS, { origin: `http://127.0.0.1:${server.port}` });
    const message = await new Promise<WorldMessage>((resolve, reject) => {
      socket.once('message', (data: Buffer) => resolve(JSON.parse(data.toString()) as WorldMessage));
      socket.once('error', reject);
    });
    socket.close();
    expect(socket.protocol).toBe('agent-world');
    expect(message.type).toBe('world');
    expect(message.world.sessions[0]?.sessionId).toBe(SESSION_ID);
  });

  /**
   * Try to open a WebSocket and report the HTTP status of the answer.
   * @param protocols - subprotocols to offer
   * @param origin - Origin header
   * @returns 101 when it opened, else the refusal status
   */
  const upgradeStatus = (protocols: string[], origin: string): Promise<number> => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, protocols, { origin });
    return new Promise<number>((resolve) => {
      socket.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      socket.once('error', () => resolve(0));
      socket.once('open', () => {
        socket.close();
        resolve(101);
      });
    });
  };

  it('refuses a WebSocket from a foreign origin, even with the token', async () => {
    expect(await upgradeStatus(PROTOCOLS, 'https://evil.example')).toBe(403);
  });

  it('refuses a WebSocket without the right token', async () => {
    const origin = `http://127.0.0.1:${server.port}`;
    expect(await upgradeStatus(['agent-world'], origin)).toBe(401);
    expect(await upgradeStatus(['agent-world', 'agent-world-token.wrong'], origin)).toBe(401);
  });

  it('broadcasts appended activity and reports a change', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, PROTOCOLS, { origin: `http://localhost:${server.port}` });
    await new Promise((resolve) => socket.once('message', resolve));
    appendFileSync(transcript, jsonl(toolResult('e1', 5), assistantText('Build fixed', true, 6)));
    const next = new Promise<WorldMessage>((resolve) => socket.once('message', (data: Buffer) => resolve(JSON.parse(data.toString()) as WorldMessage)));
    expect(await engine.tick()).toBe(true);
    const message = await next;
    socket.close();
    expect(message.world.sessions[0]?.labs[0]?.scientists[0]?.status).toBe('done');
    expect(await engine.tick()).toBe(false);
  });

  it('removes the continent when the session closes', async () => {
    rmSync(join(claudeDir, 'sessions', `${process.pid}.json`));
    expect(await engine.tick()).toBe(true);
    expect(engine.summary().sessions).toEqual([]);
  });
});
