import { spawn } from 'node:child_process';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ControlService } from '../../src/server/control';
import type { ClaudeRunner } from '../../src/server/claude-runner';
import { Engine } from '../../src/server/engine';
import { startServer, type RunningServer } from '../../src/server/http';
import { writeServerFile } from '../../src/server/server-file';
import { ProjectCatalog, projectId } from '../../src/server/projects';
import type { WorldSummary } from '../../src/shared/types';
import { assistantText, humanPrompt, setFixtureBase } from '../fixtures/lines';

setFixtureBase(Date.now() + 120_000);

const TOKEN = 'test-token-0123456789abcdef';
const OFF_TOKEN = 'off-token-0123456789abcdef';
const SESSION = 'ctl-session';

/** Calls the fake runner received. */
const calls: Array<{ kind: 'start' | 'ask'; args: string[]; cwd: string }> = [];

const fakeRunner: ClaudeRunner = {
  start(args, cwd) {
    calls.push({ kind: 'start', args, cwd });
    return { done: new Promise<number>(() => undefined), output: () => '' };
  },
  async ask(args, cwd) {
    calls.push({ kind: 'ask', args, cwd });
    return 'Explanation: fixed the build.\nExample: routes.js\nWhat it fixed or worked on:\n- duplicate imports';
  },
  stop: async () => undefined,
  kill: () => undefined,
};

let claudeDir: string;
let appDir: string;
let webDir: string;
let server: RunningServer;
let off: RunningServer;

/**
 * Make an HTTP request to a test server, with the access token unless the headers set one.
 * @param port - server port
 * @param path - path
 * @param init - method, headers and body
 * @param token - access token to send by default
 * @returns status and parsed body
 */
const call = async (port: number, path: string, init: RequestInit = {}, token = TOKEN): Promise<{ status: number; body: Record<string, unknown> }> => {
  const headers = { 'x-agent-world-token': token, ...(init.headers as Record<string, string> | undefined) };
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

/**
 * Run the real hook script with a temporary home folder.
 * @param home - home folder holding .agent-world/server.json
 * @param input - hook input
 * @param env - extra environment
 * @returns exit code and printed output
 */
const runHook = (home: string, input: unknown, env: Record<string, string> = {}): { done: Promise<{ code: number | null; stdout: string }>; kill: () => void } => {
  const hook = spawn(process.execPath, ['--import', 'tsx', 'src/server/hook.ts'], {
    env: { ...process.env, HOME: home, USERPROFILE: home, ...env },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  let stdout = '';
  hook.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  hook.stdin.end(JSON.stringify(input));
  return { done: new Promise((resolve) => hook.on('close', (code) => resolve({ code, stdout }))), kill: () => hook.kill('SIGKILL') };
};

/**
 * Wait until the world shows an open request.
 * @returns its id, or undefined after about five seconds
 */
const firstRequestId = async (): Promise<string | undefined> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const world = (await call(server.port, '/api/world')).body as unknown as WorldSummary;
    const id = world.control?.requests[0]?.id;
    if (id) return id;
  }
  return undefined;
};

const QUESTION_INPUT = {
  session_id: SESSION,
  hook_event_name: 'PreToolUse',
  tool_name: 'AskUserQuestion',
  tool_use_id: 'toolu_hook',
  tool_input: { questions: [{ question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Blue', description: '' }] }] },
};

/**
 * POST JSON with the token.
 * @param path - path
 * @param body - JSON body
 * @param token - token to send
 * @returns status and body
 */
const post = (path: string, body: unknown, token = TOKEN) =>
  call(server.port, path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-world-token': token }, body: JSON.stringify(body) });

beforeAll(async () => {
  claudeDir = mkdtempSync(join(tmpdir(), 'ctl-claude-'));
  appDir = mkdtempSync(join(tmpdir(), 'ctl-app-'));
  webDir = mkdtempSync(join(tmpdir(), 'ctl-web-'));
  writeFileSync(join(webDir, 'index.html'), '<html></html>');
  mkdirSync(join(claudeDir, 'sessions'));
  writeFileSync(join(claudeDir, 'sessions', 'a.json'), JSON.stringify({ pid: process.pid, sessionId: SESSION, cwd: appDir, startedAt: 1 }));
  const project = join(claudeDir, 'projects', '-work-app');
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, `${SESSION}.jsonl`), [humanPrompt('Fix the build'), assistantText('Fixed')].map((line) => `${JSON.stringify(line)}\n`).join(''));
  const engine = new Engine({ claudeDir });
  await engine.tick();
  const projects = new ProjectCatalog({ claudeDir, live: () => engine.liveProjects() });
  server = await startServer({ engine, port: 0, webDir, control: new ControlService({ enabled: true, engine, runner: fakeRunner, projects, logFile: join(claudeDir, 'ship-log.json') }), token: TOKEN });
  off = await startServer({ engine, port: 0, webDir, control: new ControlService({ enabled: false, engine, runner: fakeRunner }), token: OFF_TOKEN });
});

afterAll(async () => {
  await server.close();
  await off.close();
  rmSync(claudeDir, { recursive: true, force: true });
  rmSync(appDir, { recursive: true, force: true });
  rmSync(webDir, { recursive: true, force: true });
});

describe('command centre access', () => {
  it('says whether control is on and never hands out the token', async () => {
    expect((await call(server.port, '/api/control')).body).toEqual({ enabled: true });
    expect((await call(off.port, '/api/control', {}, OFF_TOKEN)).body).toEqual({ enabled: false });
  });

  it('refuses requests without the token, with the wrong token, or without JSON', async () => {
    expect((await post('/api/runs', {}, '')).status).toBe(401);
    expect((await post('/api/runs', {}, 'wrong')).status).toBe(401);
    const plain = await call(server.port, '/api/runs', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    expect(plain.status).toBe(415);
  });

  it('refuses an oversized body with 413', async () => {
    const response = await post('/api/runs', { prompt: 'x'.repeat(70 * 1024) });
    expect(response.status).toBe(413);
  });

  it('refuses a request from a foreign origin', async () => {
    const response = await call(server.port, '/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-world-token': TOKEN, origin: 'https://evil.example' },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('refuses every action when control is off, even with the right token', async () => {
    const response = await call(
      off.port,
      '/api/runs',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: SESSION, prompt: 'hi', permissionMode: 'default' }) },
      OFF_TOKEN,
    );
    expect(response.status).toBe(403);
  });
});

describe('prompt runs', () => {
  it('lists projects by id without paths', async () => {
    const response = await call(server.port, '/api/projects');
    expect(response.status).toBe(200);
    const projects = response.body.result as Array<Record<string, unknown>>;
    expect(projects[0]).toEqual({ id: projectId(appDir), name: basename(appDir), branch: expect.any(String), live: true });
    expect(JSON.stringify(response.body)).not.toContain(appDir);
    expect((await call(off.port, '/api/projects', {}, OFF_TOKEN)).body).toEqual({ result: [] });
  });

  it('launches a fresh conversation in the chosen project folder', async () => {
    const response = await post('/api/launches', { projectId: projectId(appDir), prompt: 'Add a README', permissionMode: 'acceptEdits', cwd: '/etc' });
    expect(response.status).toBe(200);
    const start = calls.filter((entry) => entry.kind === 'start').at(-1);
    expect(start?.cwd).toBe(appDir);
    expect(start?.args).toContain('--session-id');
    const { sessionId } = response.body.result as { sessionId: string };
    const conversation = await call(server.port, `/api/conversations/${sessionId}`);
    expect(conversation).toEqual({ status: 200, body: { items: [], live: false } });
  });

  it('refuses a launch with an unknown project or a bad prompt', async () => {
    expect((await post('/api/launches', { projectId: 'nope', prompt: 'x', permissionMode: 'default' })).status).toBe(404);
    expect((await post('/api/launches', { projectId: projectId(appDir), prompt: '/compact', permissionMode: 'default' })).status).toBe(400);
  });

  it('continues a session on a fork with its own session id', async () => {
    await post('/api/runs', { sessionId: SESSION, prompt: 'Now add tests', permissionMode: 'default' });
    const args = calls.at(-1)?.args ?? [];
    expect(args.slice(0, 5)).toEqual(['-p', '--resume', SESSION, '--fork-session', '--session-id']);
    expect(args.slice(6)).toEqual(['--permission-mode', 'default', 'Now add tests']);
  });

  it('shows runs in the world', async () => {
    const world = (await call(server.port, '/api/world')).body as unknown as WorldSummary;
    expect(world.control?.runs.map((run) => [run.kind, run.promptPreview])).toEqual([['reply', 'Now add tests'], ['launch', 'Add a README']]);
  });

  it('validates the prompt, the mode and the session', async () => {
    expect((await post('/api/runs', { sessionId: SESSION, prompt: '/compact', permissionMode: 'default' })).status).toBe(400);
    expect((await post('/api/runs', { sessionId: SESSION, prompt: 'x', permissionMode: 'yolo' })).status).toBe(400);
    expect((await post('/api/runs', { sessionId: 'ghost', prompt: 'x', permissionMode: 'default' })).status).toBe(404);
    expect((await post('/api/runs', { sessionId: '../etc', prompt: 'x', permissionMode: 'default' })).status).toBe(404);
  });

  it('limits how many runs go at once', async () => {
    const third = await post('/api/runs', { sessionId: SESSION, prompt: 'third', permissionMode: 'default' });
    expect(third.status).toBe(200);
    const fourth = await post('/api/runs', { sessionId: SESSION, prompt: 'fourth', permissionMode: 'default' });
    expect(fourth.status).toBe(429);
  });
});

describe('explanations', () => {
  it('asks the session on a throwaway fork and returns the answer', async () => {
    const world = (await call(server.port, '/api/world')).body as unknown as WorldSummary;
    const labId = world.sessions[0]?.labs[0]?.id;
    const response = await post('/api/explanations', { sessionId: SESSION, labId });
    expect(response.status).toBe(200);
    expect(response.body.result).toContain('Explanation: fixed the build.');
    const ask = calls.at(-1);
    expect(ask?.kind).toBe('ask');
    expect(ask?.args.slice(0, 7)).toEqual(['-p', '--resume', SESSION, '--fork-session', '--no-session-persistence', '--tools', '']);
    expect(ask?.cwd).toBe(appDir);
  });

  it('reports an unknown lab', async () => {
    expect((await post('/api/explanations', { sessionId: SESSION, labId: 'nope' })).status).toBe(404);
  });
});

describe('questions from the hook', () => {
  it('runs the real hook script end to end: raise, answer in the world, hook prints the answer', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ctl-home-'));
    writeServerFile(server.port, TOKEN, join(home, '.agent-world', 'server.json'));
    const hook = runHook(home, QUESTION_INPUT);

    const requestId = await firstRequestId();
    expect(requestId).toBeDefined();
    const world = (await call(server.port, '/api/world')).body as unknown as WorldSummary;
    expect(world.control?.requests.find((request) => request.id === requestId)?.toolUseId).toBe('toolu_hook');
    expect((await post(`/api/requests/${requestId}/answers`, { answers: { 'Which colour?': 'Blue' } })).status).toBe(200);

    const { code, stdout } = await hook.done;
    expect(code).toBe(0);
    const output = JSON.parse(stdout) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('Which colour?: Blue');
    rmSync(home, { recursive: true, force: true });
  }, 20_000);

  it('withdraws the request when the hook gives up, so a late answer is refused', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ctl-home-'));
    writeServerFile(server.port, TOKEN, join(home, '.agent-world', 'server.json'));
    const hook = runHook(home, { session_id: SESSION, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }, { AGENT_WORLD_WAIT_SECONDS: '1' });
    const requestId = await firstRequestId();
    expect(requestId).toBeDefined();
    const { stdout } = await hook.done;
    expect(stdout).toBe('');
    const world = (await call(server.port, '/api/world')).body as unknown as WorldSummary;
    expect(world.control?.requests).toEqual([]);
    expect((await post(`/api/requests/${requestId}/answers`, { decision: 'allow' })).status).toBe(404);
    expect((await call(server.port, `/api/hook-requests/${requestId}/answer?wait=0`)).status).toBe(404);
    rmSync(home, { recursive: true, force: true });
  }, 20_000);

  it('refuses an answer once the hook has died mid-wait', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ctl-home-'));
    writeServerFile(server.port, TOKEN, join(home, '.agent-world', 'server.json'));
    const hook = runHook(home, { session_id: SESSION, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' } });
    const requestId = await firstRequestId();
    expect(requestId).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 300));
    hook.kill();
    await hook.done;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await post(`/api/requests/${requestId}/answers`, { decision: 'allow' })).status).toBe(409);
    const world = (await call(server.port, '/api/world')).body as unknown as WorldSummary;
    expect(world.control?.requests).toEqual([]);
    rmSync(home, { recursive: true, force: true });
  }, 20_000);

  it('never sends the token or the tool input to a program squatting on the port, nor takes its answer', async () => {
    const seen: Array<{ method: string | undefined; headers: IncomingHttpHeaders }> = [];
    const squatter = createServer((req, res) => {
      seen.push({ method: req.method, headers: req.headers });
      req.resume();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(req.method === 'POST' ? { result: { id: 'fake', lifetimeMs: 60_000 } } : { answer: { decision: 'allow' } }));
    });
    await new Promise<void>((resolve) => squatter.listen(0, '127.0.0.1', resolve));
    const home = mkdtempSync(join(tmpdir(), 'ctl-home-'));
    writeServerFile((squatter.address() as AddressInfo).port, TOKEN, join(home, '.agent-world', 'server.json'));
    const { code, stdout } = await runHook(home, { session_id: SESSION, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' } }).done;
    await new Promise<void>((resolve) => squatter.close(() => resolve()));
    expect(code).toBe(0);
    expect(stdout).toBe('');
    expect(seen.map((entry) => entry.method)).toEqual(['GET']);
    expect(JSON.stringify(seen)).not.toContain(TOKEN);
    rmSync(home, { recursive: true, force: true });
  }, 20_000);

  it('lets the hook exit quietly when Agent World is not running', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ctl-home-'));
    const { code, stdout } = await runHook(home, { session_id: SESSION, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' } }).done;
    expect(code).toBe(0);
    expect(stdout).toBe('');
    rmSync(home, { recursive: true, force: true });
  }, 20_000);

  it('refuses an answer to an unknown request, and a wait on one', async () => {
    expect((await post('/api/requests/unknown-id/answers', { decision: 'allow' })).status).toBe(404);
    expect((await post('/api/requests/unknown-id/answers', { answers: {} })).status).toBe(404);
    expect((await call(server.port, '/api/hook-requests/unknown-id/answer?wait=0')).status).toBe(404);
  });
});
