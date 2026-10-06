import { randomUUID } from 'node:crypto';
import type { ControlRun, ControlState, PendingRequest, SessionInfo } from '../shared/types.js';
import { summarizeTool } from '../shared/tools.js';
import { askArgs, explanationQuestion, PERMISSION_MODES, runArgs, validatePrompt, type PermissionMode } from './claude-args.js';
import type { ClaudeRunner } from './claude-runner.js';
import type { Engine } from './engine.js';
import { parseQuestions, permissionDetail, RequestStore, type RequestAnswer } from './requests.js';

/** Settings for the command centre. */
export interface ControlOptions {
  enabled: boolean;
  engine: Engine;
  runner: ClaudeRunner | null;
  now?: () => number;
  requestLifetimeMs?: number;
  askTimeoutMs?: number;
  runTimeoutMs?: number;
}

/** Outcome of a command-centre action: ok with data, or a reason and HTTP status. */
export type ControlResult<T> = { ok: true; value: T } | { ok: false; status: number; reason: string };

const MAX_RUNNING = 3;
const MAX_ASKING = 2;
const MAX_RUNS_KEPT = 20;
const DEFAULT_REQUEST_LIFETIME_MS = 130_000;
const DEFAULT_ASK_TIMEOUT_MS = 240_000;
const DEFAULT_RUN_TIMEOUT_MS = 30 * 60_000;
const ID = /^[\w-]{1,100}$/;

/**
 * The command centre: starts prompt runs and explanation questions with `claude`, and holds the
 * questions and permission prompts the hook forwards until you answer them. Everything takes its
 * working folder from Claude Code's own session registry, never from the browser.
 */
export class ControlService {
  readonly requests: RequestStore;
  private readonly runs: Array<ControlRun & { output: () => string }> = [];
  private readonly running = new Set<string>();
  private readonly asking = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;

  /**
   * @param options - command-centre settings
   */
  constructor(private readonly options: ControlOptions) {
    this.now = options.now ?? Date.now;
    this.requests = new RequestStore(this.now, () => this.notify());
  }

  /** Whether control actions are allowed at all. */
  get enabled(): boolean {
    return this.options.enabled;
  }

  /**
   * Subscribe to changes in runs and requests.
   * @param listener - called after a change
   * @returns unsubscribe function
   */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Command-centre state for the browser.
   * @returns state
   */
  state(): ControlState {
    return {
      enabled: this.enabled,
      requests: this.enabled ? this.requests.list(this.now()) : [],
      runs: this.runs.map(({ output: _output, ...run }) => run),
    };
  }

  /**
   * Start a prompt run: a new task in a session's project folder, or a continuation of the session
   * on a fork.
   * @param body - request body from the browser
   * @returns the run, or why it was refused
   */
  startRun(body: Record<string, unknown>): ControlResult<ControlRun> {
    const guard = this.guard();
    if (guard) return guard;
    const session = this.liveSession(body.sessionId);
    if (!session) return { ok: false, status: 404, reason: 'That session is no longer running.' };
    const check = validatePrompt(body.prompt);
    if (!check.ok) return { ok: false, status: 400, reason: check.reason };
    const mode = PERMISSION_MODES.find((candidate) => candidate === body.permissionMode);
    if (!mode) return { ok: false, status: 400, reason: 'Pick a permission mode.' };
    if (body.mode !== 'new' && body.mode !== 'continue') return { ok: false, status: 400, reason: 'Choose to start a new task or continue the session.' };
    if (this.running.size >= MAX_RUNNING) {
      return { ok: false, status: 429, reason: `At most ${MAX_RUNNING} runs at a time; wait for one to finish.` };
    }
    return { ok: true, value: this.launch(session, check.prompt, mode, body.mode === 'continue') };
  }

  /**
   * Ask a session to explain a lab's or one agent's work.
   * @param body - request body from the browser
   * @returns the explanation, or why it failed
   */
  async explain(body: Record<string, unknown>): Promise<ControlResult<string>> {
    const guard = this.guard();
    if (guard) return guard;
    const session = this.liveSession(body.sessionId);
    if (!session) return { ok: false, status: 404, reason: 'That session is no longer running.' };
    const lab = typeof body.labId === 'string' ? this.options.engine.lab(session.sessionId, body.labId) : null;
    if (!lab) return { ok: false, status: 404, reason: 'That lab was not found.' };
    const agent = typeof body.scientistId === 'string' && body.scientistId !== 'main' && Object.hasOwn(lab.scientists, body.scientistId) ? lab.scientists[body.scientistId] : undefined;
    if (this.asking.has(session.sessionId)) return { ok: false, status: 429, reason: 'This session is already answering a question.' };
    if (this.asking.size >= MAX_ASKING) return { ok: false, status: 429, reason: `At most ${MAX_ASKING} explanations at a time; wait for one to finish.` };
    const question = explanationQuestion({ labIndex: lab.index, prompt: lab.prompt, ...(agent ? { agent: { role: agent.role, description: agent.description } } : {}) });
    this.asking.add(session.sessionId);
    try {
      const runner = this.options.runner;
      if (!runner) return { ok: false, status: 503, reason: 'The claude command was not found on this machine.' };
      const text = await runner.ask(askArgs(session.sessionId, question), session.cwd, this.options.askTimeoutMs ?? DEFAULT_ASK_TIMEOUT_MS);
      return { ok: true, value: text };
    } catch (error) {
      return { ok: false, status: 502, reason: (error as Error).message };
    } finally {
      this.asking.delete(session.sessionId);
    }
  }

  /**
   * Record a question or permission prompt forwarded by the hook.
   * @param body - hook payload
   * @returns the new request id and how long it stays open, or why it was refused
   */
  raise(body: Record<string, unknown>): ControlResult<{ id: string; lifetimeMs: number }> {
    if (!this.enabled) return { ok: false, status: 403, reason: 'Control is off.' };
    if (typeof body.sessionId !== 'string' || !ID.test(body.sessionId)) return { ok: false, status: 400, reason: 'Bad session id.' };
    const lifetimeMs = this.options.requestLifetimeMs ?? DEFAULT_REQUEST_LIFETIME_MS;
    const tool = typeof body.toolName === 'string' ? body.toolName.slice(0, 200) : '';
    const input = typeof body.toolInput === 'object' && body.toolInput !== null ? (body.toolInput as Record<string, unknown>) : {};
    let request;
    if (body.event === 'question') {
      const questions = parseQuestions(input);
      if (!questions.length) return { ok: false, status: 400, reason: 'No questions.' };
      request = this.requests.create({ kind: 'question', sessionId: body.sessionId, questions }, lifetimeMs);
    } else if (body.event === 'permission' && tool) {
      request = this.requests.create({ kind: 'permission', sessionId: body.sessionId, tool, summary: summarizeTool(tool, input), ...permissionDetail(tool, input) }, lifetimeMs);
    } else {
      return { ok: false, status: 400, reason: 'Unknown event.' };
    }
    this.notify();
    return { ok: true, value: { id: request.id, lifetimeMs } };
  }

  /**
   * Answer a request from the browser.
   * @param id - request id
   * @param body - `{answers}` for a question or `{decision}` for a permission
   * @returns ok, or why it was refused
   */
  answer(id: string, body: Record<string, unknown>): ControlResult<true> {
    const guard = this.guard(false);
    if (guard) return guard;
    const request = this.requests.get(id);
    if (!request) return { ok: false, status: 404, reason: 'That request was already answered or has expired.' };
    const answer = readAnswer(body, request);
    if (!answer) return { ok: false, status: 400, reason: request.kind === 'permission' ? 'Choose Allow or Deny.' : 'Answer every question.' };
    if (request.kind === 'permission' && request.truncated && 'decision' in answer && answer.decision === 'allow') {
      return { ok: false, status: 400, reason: 'This request is too long to review here; allow it in the session, or deny it here.' };
    }
    const outcome = this.requests.answer(id, answer);
    if (outcome === 'gone') return { ok: false, status: 404, reason: 'That request was already answered or has expired.' };
    if (outcome === 'abandoned') {
      this.notify();
      return { ok: false, status: 409, reason: 'The agent stopped waiting here; answer it in the session.' };
    }
    this.notify();
    return { ok: true, value: true };
  }

  /**
   * Withdraw a request when its hook gives up and Claude Code shows its own dialog.
   * @param id - request id
   */
  cancel(id: string): void {
    if (this.requests.cancel(id)) this.notify();
  }

  /**
   * Stop every run and explanation that is still going, waiting for them to exit; called when Agent
   * World shuts down.
   * @returns resolves when they have exited
   */
  async stop(): Promise<void> {
    await this.options.runner?.stop();
  }

  /** Kill every run and explanation at once; the last resort when the process is exiting. */
  kill(): void {
    this.options.runner?.kill();
  }

  /**
   * Refuse when control is off or `claude` is missing.
   * @param needsRunner - whether the action launches claude
   * @returns a refusal, or null when allowed
   */
  private guard(needsRunner = true): ControlResult<never> | null {
    if (!this.enabled) return { ok: false, status: 403, reason: 'Control is off. Start Agent World with --allow-control.' };
    if (needsRunner && !this.options.runner) return { ok: false, status: 503, reason: 'The claude command was not found on this machine.' };
    return null;
  }

  /**
   * A live session by id from the registry, never a path from the browser.
   * @param value - session id from the request
   * @returns the session, or undefined
   */
  private liveSession(value: unknown): SessionInfo | undefined {
    return typeof value === 'string' && ID.test(value) ? this.options.engine.liveSession(value) : undefined;
  }

  /**
   * Launch a run and track it until it ends.
   * @param session - session whose project folder (and context, when continuing) is used
   * @param prompt - checked prompt
   * @param mode - permission mode
   * @param resume - continue the session on a fork
   * @returns the run
   */
  private launch(session: SessionInfo, prompt: string, mode: PermissionMode, resume: boolean): ControlRun {
    const runner = this.options.runner as ClaudeRunner;
    const args = runArgs({ prompt, permissionMode: mode, ...(resume ? { resumeSessionId: session.sessionId } : {}) });
    const handle = runner.start(args, session.cwd, this.options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS);
    const run = {
      id: randomUUID(),
      sessionId: resume ? session.sessionId : null,
      cwd: session.cwd,
      prompt,
      startedAt: new Date(this.now()).toISOString(),
      state: 'running' as ControlRun['state'],
      exitCode: null as number | null,
      output: handle.output,
    };
    this.runs.unshift(run);
    this.runs.splice(MAX_RUNS_KEPT);
    this.running.add(run.id);
    const finish = (code: number): void => {
      this.running.delete(run.id);
      run.state = code === 0 ? 'finished' : 'failed';
      run.exitCode = code;
      this.notify();
    };
    handle.done.then(finish, () => finish(-1));
    this.notify();
    const { output: _output, ...visible } = run;
    return visible;
  }

  /** Tell subscribers that runs or requests changed. */
  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

/**
 * Read and check an answer body against the request it answers: a permission takes only a decision,
 * a question set takes an answer for each of its own questions (anything else is dropped).
 * @param body - request body
 * @param request - the request being answered
 * @returns the answer, or null when malformed or incomplete
 */
function readAnswer(body: Record<string, unknown>, request: PendingRequest): RequestAnswer | null {
  if (request.kind === 'permission') return body.decision === 'allow' || body.decision === 'deny' ? { decision: body.decision } : null;
  if (typeof body.answers !== 'object' || body.answers === null || Array.isArray(body.answers)) return null;
  const given = body.answers as Record<string, unknown>;
  const entries = request.questions.map((question): [string, string] => {
    const value = Object.hasOwn(given, question.question) ? given[question.question] : undefined;
    return [question.question, typeof value === 'string' ? value.trim().slice(0, 2000) : ''];
  });
  return entries.every(([, answer]) => answer) ? { answers: Object.fromEntries(entries) } : null;
}
