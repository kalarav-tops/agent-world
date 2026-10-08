import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import type { ControlState, PendingRequest, ProjectView, SessionInfo, ShipLogEntry } from '../shared/types.js';
import { summarizeTool } from '../shared/tools.js';
import { askArgs, EFFORTS, explanationQuestion, launchArgs, MODELS, PERMISSION_MODES, runArgs, validatePrompt } from './claude-args.js';
import type { ClaudeRunner } from './claude-runner.js';
import type { Engine } from './engine.js';
import { parseQuestions, permissionDetail, RequestStore, type RequestAnswer } from './requests.js';
import { toView, type KnownProject, type ProjectCatalog } from './projects.js';
import { previewOf, readShipLog, SHIP_LOG_LIMIT, writeShipLog } from './ship-log.js';

/** Settings for the command centre. */
export interface ControlOptions {
  enabled: boolean;
  engine: Engine;
  runner: ClaudeRunner | null;
  now?: () => number;
  requestLifetimeMs?: number;
  askTimeoutMs?: number;
  runTimeoutMs?: number;
  projects?: ProjectCatalog;
  logFile?: string;
  newId?: () => string;
}

/** Outcome of a command-centre action: ok with data, or a reason and HTTP status. */
export type ControlResult<T> = { ok: true; value: T } | { ok: false; status: number; reason: string };

const MAX_RUNNING = 3;
const MAX_ASKING = 2;
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
  private log: ShipLogEntry[];
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
    this.log = options.enabled && options.logFile ? readShipLog(options.logFile) : [];
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
      runs: this.log.slice(0, RUNS_IN_SUMMARY),
    };
  }

  /**
   * Continue a session's work on a fork, from a lab panel's reply box. The fork gets a session id
   * chosen here, so the ship log can show its conversation.
   * @param body - `{sessionId, prompt, permissionMode}` from the browser
   * @returns the logged run, or why it was refused
   */
  startRun(body: Record<string, unknown>): ControlResult<ShipLogEntry> {
    const guard = this.guard();
    if (guard) return guard;
    const session = this.liveSession(body.sessionId);
    if (!session) return { ok: false, status: 404, reason: 'That session is no longer running.' };
    const check = validatePrompt(body.prompt);
    if (!check.ok) return { ok: false, status: 400, reason: check.reason };
    const mode = PERMISSION_MODES.find((candidate) => candidate === body.permissionMode);
    if (!mode) return { ok: false, status: 400, reason: 'Pick a permission mode.' };
    if (this.running.size >= MAX_RUNNING) return this.busy();
    const id = this.newId();
    const forkId = this.newId();
    const args = runArgs({ prompt: check.prompt, permissionMode: mode, resumeSessionId: session.sessionId, newSessionId: forkId });
    const name = session.cwd.split(/[\\/]/).pop() || session.cwd;
    const entry = this.track(id, args, session.cwd, { kind: 'reply', sessionId: forkId, projectId: null, projectName: name, promptPreview: previewOf(check.prompt), model: '', effort: '', permissionMode: mode });
    return { ok: true, value: entry };
  }

  /**
   * Start a fresh conversation from the ship in a project the server knows, by id.
   * @param body - `{projectId, prompt, permissionMode, model?, effort?}`
   * @returns the launch id and the new session id, or why it was refused
   */
  async launch(body: Record<string, unknown>): Promise<ControlResult<{ launchId: string; sessionId: string }>> {
    const guard = this.guard();
    if (guard) return guard;
    const project = typeof body.projectId === 'string' ? await this.options.projects?.find(body.projectId) : undefined;
    if (!project) return { ok: false, status: 404, reason: 'That project is not in the list; reload it.' };
    const check = validatePrompt(body.prompt);
    if (!check.ok) return { ok: false, status: 400, reason: check.reason };
    const mode = PERMISSION_MODES.find((candidate) => candidate === body.permissionMode);
    if (!mode) return { ok: false, status: 400, reason: 'Pick a permission mode.' };
    const model = pick(MODELS, body.model);
    if (model === null) return { ok: false, status: 400, reason: 'Pick a model from the list.' };
    const effort = pick(EFFORTS, body.effort);
    if (effort === null) return { ok: false, status: 400, reason: 'Pick an effort level from the list.' };
    if (!isFolder(project.cwd)) {
      this.options.projects?.invalidate();
      return { ok: false, status: 404, reason: 'That project folder no longer exists.' };
    }
    if (this.running.size >= MAX_RUNNING) return this.busy();
    const launchId = this.newId();
    const sessionId = this.newId();
    const args = launchArgs({ sessionId, prompt: check.prompt, permissionMode: mode, ...(model ? { model } : {}), ...(effort ? { effort } : {}) });
    this.track(launchId, args, project.cwd, launchEntry(project, sessionId, check.prompt, mode, model ?? '', effort ?? ''));
    return { ok: true, value: { launchId, sessionId } };
  }

  /**
   * Projects a fresh conversation can start in, without paths.
   * @returns the list; empty when control is off
   */
  async projects(): Promise<ControlResult<ProjectView[]>> {
    if (!this.enabled || !this.options.projects) return { ok: true, value: [] };
    return { ok: true, value: (await this.options.projects.list()).map(toView) };
  }

  /**
   * Whether the ship log has a conversation with this session id; such sessions stay readable
   * after they stop.
   * @param sessionId - session id
   * @returns true when logged
   */
  hasLogged(sessionId: string): boolean {
    return this.log.some((entry) => entry.sessionId === sessionId);
  }

  /**
   * Whether a run with this session id is still going, so its transcript may not be written yet.
   * @param sessionId - session id
   * @returns true while running
   */
  isRunning(sessionId: string): boolean {
    return this.log.some((entry) => entry.sessionId === sessionId && entry.state === 'running');
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
    const ids = typeof body.toolUseId === 'string' && ID.test(body.toolUseId) ? { toolUseId: body.toolUseId } : {};
    let request;
    if (body.event === 'question') {
      const questions = parseQuestions(input);
      if (!questions.length) return { ok: false, status: 400, reason: 'No questions.' };
      request = this.requests.create({ kind: 'question', sessionId: body.sessionId, questions, ...ids }, lifetimeMs);
    } else if (body.event === 'permission' && tool) {
      request = this.requests.create({ kind: 'permission', sessionId: body.sessionId, tool, summary: summarizeTool(tool, input), ...permissionDetail(tool, input), ...ids }, lifetimeMs);
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
   * Start `claude`, log the run, and update the log when it ends.
   * @param id - log entry id
   * @param args - claude arguments
   * @param cwd - working folder from the registry or the project catalogue
   * @param fields - what to log about it
   * @returns the logged entry
   */
  private track(id: string, args: string[], cwd: string, fields: LogFields): ShipLogEntry {
    const runner = this.options.runner as ClaudeRunner;
    const handle = runner.start(args, cwd, this.options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS);
    const entry: ShipLogEntry = { ...fields, id, startedAt: new Date(this.now()).toISOString(), endedAt: null, state: 'running', exitCode: null };
    this.running.add(id);
    this.record([entry, ...this.log]);
    const finish = (code: number): void => {
      this.running.delete(id);
      const endedAt = new Date(this.now()).toISOString();
      this.record(this.log.map((item) => (item.id === id ? { ...item, state: code === 0 ? 'finished' : 'failed', exitCode: code, endedAt } : item)));
    };
    handle.done.then(finish, () => finish(-1));
    return entry;
  }

  /**
   * Replace the log, save it when there is a log file, and tell subscribers. A failed save is
   * logged and the run goes on.
   * @param next - new log, newest first
   */
  private record(next: ShipLogEntry[]): void {
    this.log = next.slice(0, SHIP_LOG_LIMIT);
    if (this.options.logFile) {
      try {
        writeShipLog(this.log, this.options.logFile);
      } catch (error) {
        process.stderr.write(`agent-world: could not save the ship log: ${(error as Error).message}\n`);
      }
    }
    this.notify();
  }

  /**
   * The refusal when the run limit is reached.
   * @returns a 429 result
   */
  private busy(): ControlResult<never> {
    return { ok: false, status: 429, reason: `At most ${MAX_RUNNING} runs at a time; wait for one to finish.` };
  }

  /**
   * A fresh id.
   * @returns a UUID (or the test's id)
   */
  private newId(): string {
    return (this.options.newId ?? randomUUID)();
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

const RUNS_IN_SUMMARY = 50;

/** What the caller supplies when logging a run. */
type LogFields = Omit<ShipLogEntry, 'id' | 'startedAt' | 'endedAt' | 'state' | 'exitCode'>;

/**
 * The log fields for a fresh launch.
 * @param project - project it runs in
 * @param sessionId - its session id
 * @param prompt - checked prompt
 * @param mode - permission mode
 * @param model - model alias or empty
 * @param effort - effort level or empty
 * @returns entry fields
 */
function launchEntry(project: KnownProject, sessionId: string, prompt: string, mode: string, model: string, effort: string): LogFields {
  return { kind: 'launch', sessionId, projectId: project.id, projectName: project.name, promptPreview: previewOf(prompt), model, effort, permissionMode: mode };
}

/**
 * An optional value from an allow-list.
 * @param allowed - allowed values
 * @param value - value from the browser
 * @returns the value, undefined when absent or empty, or null when not allowed
 */
function pick<T extends string>(allowed: readonly T[], value: unknown): T | undefined | null {
  if (value === undefined || value === '') return undefined;
  return allowed.find((candidate) => candidate === value) ?? null;
}

/**
 * Whether a path is an existing folder.
 * @param path - folder path from the project catalogue
 * @returns true when it is a folder
 */
function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
