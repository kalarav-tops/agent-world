import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Engine } from '../../src/server/engine';
import { startServer } from '../../src/server/http';
import { assistantText, humanPrompt, setFixtureBase, thinking, toolUse } from '../fixtures/lines';

setFixtureBase(Date.now() + 120_000);

/**
 * Serialize transcript lines as JSONL.
 * @param lines - lines
 * @returns JSONL text
 */
const jsonl = (...lines: Record<string, unknown>[]): string => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
const TOKEN = 'fedcba9876543210fedcba9876543210';

describe('engine resilience', () => {
  let claudeDir: string;

  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), 'resilience-'));
    mkdirSync(join(claudeDir, 'sessions'));
  });

  afterEach(() => rmSync(claudeDir, { recursive: true, force: true }));

  /**
   * Register a live session and write its transcript.
   * @param sessionId - session id
   * @param lines - transcript lines
   * @returns transcript path and its subagent folder
   */
  const addSession = (sessionId: string, lines: Record<string, unknown>[]): { transcript: string; subagents: string } => {
    writeFileSync(join(claudeDir, 'sessions', `${sessionId}.json`), JSON.stringify({ pid: process.pid, sessionId, cwd: `/w/${sessionId}`, startedAt: 1 }));
    const project = join(claudeDir, 'projects', `-w-${sessionId}`);
    const subagents = join(project, sessionId, 'subagents');
    mkdirSync(subagents, { recursive: true });
    const transcript = join(project, `${sessionId}.jsonl`);
    writeFileSync(transcript, jsonl(...lines));
    return { transcript, subagents };
  };

  it.skipIf(process.getuid?.() === 0)('keeps other sessions updating when one transcript cannot be read', async () => {
    const broken = addSession('aaa', [humanPrompt('one')]);
    addSession('bbb', [humanPrompt('two')]);
    chmodSync(broken.transcript, 0o000);
    const engine = new Engine({ claudeDir });
    expect(await engine.tick()).toBe(true);
    const world = engine.summary();
    expect(world.sessions.find((session) => session.sessionId === 'bbb')?.labs).toHaveLength(1);
    chmodSync(broken.transcript, 0o644);
  });

  it('places a nested subagent in its parent lab even when it is read first', async () => {
    const { subagents } = addSession('nest', [
      humanPrompt('one'),
      toolUse('a1', 'Agent', { subagent_type: 'Plan', description: 'Parent', prompt: 'plan it' }),
      humanPrompt('two', 20),
    ]);
    writeFileSync(join(subagents, 'agent-a-child.meta.json'), JSON.stringify({ agentType: 'Explore', toolUseId: 'n1', spawnDepth: 2 }));
    writeFileSync(join(subagents, 'agent-a-child.jsonl'), jsonl(thinking(8)));
    writeFileSync(join(subagents, 'agent-b-parent.meta.json'), JSON.stringify({ agentType: 'Plan', toolUseId: 'a1', spawnDepth: 1 }));
    writeFileSync(join(subagents, 'agent-b-parent.jsonl'), jsonl(toolUse('n1', 'Agent', { subagent_type: 'Explore', description: 'Child', prompt: 'look' }, 5)));

    const engine = new Engine({ claudeDir });
    await engine.tick();
    const [labOne, labTwo] = engine.summary().sessions[0]?.labs ?? [];
    expect(labOne?.scientists.map((scientist) => [scientist.id, scientist.parentId])).toEqual([
      ['main', null],
      ['b-parent', 'main'],
      ['a-child', 'b-parent'],
    ]);
    expect(labTwo?.scientists).toHaveLength(1);
  });

  it('waits for a subagent meta file written after its transcript', async () => {
    const { subagents } = addSession('late', [humanPrompt('one'), toolUse('a1', 'Agent', { description: 'x', prompt: 'p' }), humanPrompt('two', 20)]);
    writeFileSync(join(subagents, 'agent-z.jsonl'), jsonl(thinking(5)));
    const engine = new Engine({ claudeDir });
    await engine.tick();
    expect(engine.summary().sessions[0]?.labs.flatMap((lab) => lab.scientists.map((scientist) => scientist.id))).not.toContain('z');

    writeFileSync(join(subagents, 'agent-z.meta.json'), JSON.stringify({ agentType: 'Explore', toolUseId: 'a1' }));
    await engine.tick();
    const labOne = engine.summary().sessions[0]?.labs[0];
    expect(labOne?.scientists.find((scientist) => scientist.id === 'z')?.role).toBe('Explore');
  });

  it('stops waiting for a meta file that never comes', async () => {
    const { subagents } = addSession('never', [humanPrompt('one')]);
    writeFileSync(join(subagents, 'agent-q.jsonl'), jsonl(assistantText('hi', true, 5)));
    const engine = new Engine({ claudeDir });
    for (let tick = 0; tick < 8; tick += 1) await engine.tick();
    expect(engine.summary().sessions[0]?.labs[0]?.scientists.map((scientist) => scientist.id)).toContain('q');
  });
});

describe('server hardening', () => {
  let claudeDir: string;
  let webDir: string;

  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), 'harden-'));
    webDir = mkdtempSync(join(tmpdir(), 'harden-web-'));
    writeFileSync(join(webDir, 'index.html'), '<html></html>');
  });

  afterEach(() => {
    rmSync(claudeDir, { recursive: true, force: true });
    rmSync(webDir, { recursive: true, force: true });
  });

  /**
   * GET a path and resolve with the status code.
   * @param port - server port
   * @param path - request path
   * @returns status code
   */
  const status = (port: number, path: string): Promise<number> =>
    new Promise((resolve, reject) => {
      request({ host: '127.0.0.1', port, path, headers: { host: `127.0.0.1:${port}`, 'x-agent-world-token': TOKEN } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
        .on('error', reject)
        .end();
    });

  /**
   * Open a raw TCP connection and send a WebSocket upgrade request.
   * @param port - server port
   * @param origin - Origin header
   * @returns the connected socket
   */
  const rawUpgrade = (port: number, origin: string) =>
    new Promise<ReturnType<typeof connect>>((resolve) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write(
          [
            'GET /ws HTTP/1.1',
            `Host: 127.0.0.1:${port}`,
            `Origin: ${origin}`,
            'Upgrade: websocket',
            'Connection: Upgrade',
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version: 13',
            `Sec-WebSocket-Protocol: agent-world, agent-world-token.${TOKEN}`,
            '',
            '',
          ].join('\r\n'),
        );
        resolve(socket);
      });
      socket.on('error', () => undefined);
    });

  it('survives an invalid WebSocket frame from a connected client', async () => {
    const server = await startServer({ engine: new Engine({ claudeDir }), port: 0, webDir, token: TOKEN });
    const socket = await rawUpgrade(server.port, `http://127.0.0.1:${server.port}`);
    await new Promise((resolve) => socket.once('data', resolve));
    socket.write(Buffer.from([0x81, 0x01, 0x61]));
    await new Promise((resolve) => setTimeout(resolve, 100));
    socket.destroy();
    expect(await status(server.port, '/api/world')).toBe(200);
    await server.close();
  });

  it('survives a client that resets a rejected upgrade', async () => {
    const server = await startServer({ engine: new Engine({ claudeDir }), port: 0, webDir, token: TOKEN });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const socket = await rawUpgrade(server.port, 'https://evil.example');
      socket.resetAndDestroy();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await status(server.port, '/api/world')).toBe(200);
    await server.close();
  });

  it('answers 500 instead of hanging when a route throws', async () => {
    const engine = new Engine({ claudeDir });
    const broken = Object.assign(engine, {
      summary: () => {
        throw new Error('boom');
      },
    });
    const server = await startServer({ engine: broken, port: 0, webDir, token: TOKEN });
    expect(await status(server.port, '/api/world')).toBe(500);
    expect(await status(server.port, '/')).toBe(200);
    await server.close();
  });

  it('rejects with a clear error when the port is taken', async () => {
    const first = await startServer({ engine: new Engine({ claudeDir }), port: 0, webDir, token: TOKEN });
    await expect(startServer({ engine: new Engine({ claudeDir }), port: first.port, webDir, token: TOKEN })).rejects.toThrow(/EADDRINUSE|in use/);
    await first.close();
  });
});
