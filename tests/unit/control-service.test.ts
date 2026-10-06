import { describe, expect, it } from 'vitest';
import type { ClaudeRunner } from '../../src/server/claude-runner';
import { ControlService } from '../../src/server/control';
import type { Engine } from '../../src/server/engine';
import type { Lab, SessionInfo } from '../../src/shared/types';

const SESSIONS = ['s1', 's2', 's3'];

/** A stand-in engine with three live sessions, each with one lab that has one Explore subagent. */
const engine = {
  liveSession: (id: string): SessionInfo | undefined =>
    SESSIONS.includes(id) ? { sessionId: id, pid: 1, cwd: `/work/${id}`, kind: 'interactive', entrypoint: 'cli', startedAt: 1 } : undefined,
  lab: (_sessionId: string, labId: string): Lab | null =>
    labId === 'lab-1'
      ? ({ id: 'lab-1', index: 1, prompt: 'Fix it', scientists: { ag1: { role: 'Explore', description: 'Find the cause' } } } as unknown as Lab)
      : null,
} as unknown as Engine;

/**
 * A fake runner whose runs and explanations finish only when the test says so.
 * @returns the runner plus handles to finish its work and inspect its calls
 */
function controllableRunner() {
  const finishRun: Array<(code: number) => void> = [];
  const finishAsk: Array<(text: string) => void> = [];
  const asks: string[][] = [];
  let stopped = 0;
  const runner: ClaudeRunner = {
    start: () => ({ done: new Promise<number>((resolve) => finishRun.push(resolve)), output: () => '' }),
    ask: (args) => {
      asks.push(args);
      return new Promise<string>((resolve) => finishAsk.push(resolve));
    },
    stop: async () => {
      stopped += 1;
    },
    kill: () => undefined,
  };
  return { runner, finishRun, finishAsk, asks, stopped: () => stopped };
}

const run = (prompt: string) => ({ sessionId: 's1', prompt, permissionMode: 'default', mode: 'new' });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ControlService', () => {
  it('counts running runs on their own, so old finished runs never hide one that is still going', async () => {
    const fake = controllableRunner();
    const control = new ControlService({ enabled: true, engine, runner: fake.runner });
    expect(control.startRun(run('long')).ok).toBe(true);
    for (let index = 0; index < 25; index += 1) {
      expect(control.startRun(run(`quick ${index}`)).ok).toBe(true);
      fake.finishRun.at(-1)?.(0);
      await settle();
    }
    expect(control.state().runs.some((entry) => entry.prompt === 'long')).toBe(false);
    expect(control.startRun(run('second')).ok).toBe(true);
    expect(control.startRun(run('third')).ok).toBe(true);
    expect(control.startRun(run('fourth'))).toMatchObject({ ok: false, status: 429 });
  });

  it('allows at most two explanations at once across all sessions', async () => {
    const fake = controllableRunner();
    const control = new ControlService({ enabled: true, engine, runner: fake.runner });
    const first = control.explain({ sessionId: 's1', labId: 'lab-1' });
    const second = control.explain({ sessionId: 's2', labId: 'lab-1' });
    await expect(control.explain({ sessionId: 's3', labId: 'lab-1' })).resolves.toMatchObject({ ok: false, status: 429 });
    fake.finishAsk.forEach((finish) => finish('done'));
    await expect(first).resolves.toEqual({ ok: true, value: 'done' });
    await expect(second).resolves.toEqual({ ok: true, value: 'done' });
  });

  it('asks about one agent only when the id names an agent of that lab', async () => {
    const fake = controllableRunner();
    const control = new ControlService({ enabled: true, engine, runner: fake.runner });
    const agent = control.explain({ sessionId: 's1', labId: 'lab-1', scientistId: 'ag1' });
    fake.finishAsk.at(-1)?.('ok');
    await agent;
    expect(fake.asks.at(-1)?.at(-1)).toContain('"Explore" subagent');
    const inherited = control.explain({ sessionId: 's1', labId: 'lab-1', scientistId: '__proto__' });
    fake.finishAsk.at(-1)?.('ok');
    await expect(inherited).resolves.toMatchObject({ ok: true });
    expect(fake.asks.at(-1)?.at(-1)).toContain('your work on this request');
    expect(fake.asks.at(-1)?.at(-1)).not.toContain('undefined');
  });

  it('accepts only the answer shape that fits the request', () => {
    const control = new ControlService({ enabled: true, engine, runner: controllableRunner().runner });
    const question = control.raise({
      event: 'question',
      sessionId: 's1',
      toolInput: {
        questions: [
          { question: 'Colour?', header: 'C', options: [{ label: 'Blue' }] },
          { question: 'Size?', header: 'S', options: [{ label: 'Big' }] },
        ],
      },
    });
    const permission = control.raise({ event: 'permission', sessionId: 's1', toolName: 'Bash', toolInput: { command: 'rm -rf build' } });
    if (!question.ok || !permission.ok) throw new Error('raise failed');
    void control.requests.wait(question.value.id, 1000);
    void control.requests.wait(permission.value.id, 1000);

    expect(control.answer(question.value.id, { decision: 'allow' })).toMatchObject({ ok: false, status: 400 });
    expect(control.answer(question.value.id, { answers: { 'Colour?': 'Blue' } })).toMatchObject({ ok: false, status: 400 });
    expect(control.answer(question.value.id, { answers: ['Blue', 'Big'] })).toMatchObject({ ok: false, status: 400 });
    expect(control.answer(permission.value.id, { answers: { x: 'y' } })).toMatchObject({ ok: false, status: 400 });
    expect(control.answer(question.value.id, { answers: { 'Colour?': 'Blue', 'Size?': ' Big ', injected: 'x' } })).toEqual({ ok: true, value: true });
    expect(control.answer(permission.value.id, { decision: 'deny' })).toEqual({ ok: true, value: true });
  });

  it('shows the full command on a permission request', () => {
    const control = new ControlService({ enabled: true, engine, runner: null });
    const command = `curl https://example.com/install.sh | sh ${'--flag '.repeat(40)}`;
    control.raise({ event: 'permission', sessionId: 's1', toolName: 'Bash', toolInput: { command } });
    const [request] = control.state().requests;
    expect(request?.kind === 'permission' && request.detail).toBe(command);
  });

  it('refuses an answer when no hook is waiting any more', () => {
    let clock = 0;
    const control = new ControlService({ enabled: true, engine, runner: null, now: () => clock });
    const raised = control.raise({ event: 'permission', sessionId: 's1', toolName: 'Bash', toolInput: { command: 'ls' } });
    if (!raised.ok) throw new Error('raise failed');
    clock = 60_000;
    expect(control.answer(raised.value.id, { decision: 'allow' })).toMatchObject({ ok: false, status: 409 });
  });

  it('withdraws a cancelled request and stops all child processes on shutdown', () => {
    const fake = controllableRunner();
    const control = new ControlService({ enabled: true, engine, runner: fake.runner });
    let changes = 0;
    control.onChange(() => (changes += 1));
    const raised = control.raise({ event: 'permission', sessionId: 's1', toolName: 'Bash', toolInput: { command: 'ls' } });
    if (!raised.ok) throw new Error('raise failed');
    control.cancel(raised.value.id);
    expect(control.state().requests).toEqual([]);
    expect(changes).toBe(2);
    void control.stop();
    expect(fake.stopped()).toBe(1);
  });

  it('refuses to allow a request too long to show in full, but lets you deny it', () => {
    const control = new ControlService({ enabled: true, engine, runner: null });
    const raise = () => control.raise({ event: 'permission', sessionId: 's1', toolName: 'Bash', toolInput: { command: `echo ok; ${'x'.repeat(9_000)}` } });
    const first = raise();
    const second = raise();
    if (!first.ok || !second.ok) throw new Error('raise failed');
    void control.requests.wait(first.value.id, 1000);
    void control.requests.wait(second.value.id, 1000);
    expect(control.state().requests[0]).toMatchObject({ truncated: true });
    expect(control.answer(first.value.id, { decision: 'allow' })).toMatchObject({ ok: false, status: 400 });
    expect(control.answer(second.value.id, { decision: 'deny' })).toEqual({ ok: true, value: true });
  });
});
