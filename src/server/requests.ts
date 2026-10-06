import { randomUUID } from 'node:crypto';
import type { AgentQuestion, PendingRequest, QuestionOption } from '../shared/types.js';

/** What the hook reports when an agent needs you. */
export type RequestInput =
  | { kind: 'question'; sessionId: string; questions: AgentQuestion[] }
  | { kind: 'permission'; sessionId: string; tool: string; summary: string; detail: string; truncated: boolean };

/** Your answer to a request. */
export type RequestAnswer = { answers: Record<string, string> } | { decision: 'allow' | 'deny' };

/** What happened to an answer: delivered, the request is gone, or no hook is waiting for it any more. */
export type AnswerOutcome = 'answered' | 'gone' | 'abandoned';

interface Entry {
  request: PendingRequest;
  answer: RequestAnswer | null;
  waiters: Array<(answer: RequestAnswer) => void>;
  expiresAtMs: number;
  lastSeenMs: number;
}

const MAX_REQUESTS = 50;
const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 8;
const MAX_TEXT = 500;
const DETAIL_LIMIT = 8_000;
const POLL_GRACE_MS = 5_000;
const FORGET_AFTER_MS = 60_000;

/**
 * Questions and permission prompts that agents are waiting on, raised by the Agent World hook and
 * answered from the browser. A request stays answerable only while its hook keeps polling, so an
 * answer is never accepted for an agent that has already moved on.
 */
export class RequestStore {
  private readonly entries = new Map<string, Entry>();

  /**
   * @param now - clock, epoch milliseconds
   * @param onChange - called when a request expires or its hook stops waiting, so the page can drop it
   */
  constructor(
    private readonly now: () => number = Date.now,
    private readonly onChange: () => void = () => undefined,
  ) {}

  /**
   * Record a new request.
   * @param input - what the agent asked
   * @param lifetimeMs - how long it stays open
   * @returns the request
   */
  create(input: RequestInput, lifetimeMs: number): PendingRequest {
    this.prune();
    const created = this.now();
    const base = { id: randomUUID(), sessionId: input.sessionId, createdAt: new Date(created).toISOString(), expiresAt: new Date(created + lifetimeMs).toISOString() };
    const request: PendingRequest =
      input.kind === 'question'
        ? { ...base, kind: 'question', questions: input.questions }
        : { ...base, kind: 'permission', tool: input.tool, summary: input.summary, detail: input.detail, truncated: input.truncated };
    this.entries.set(request.id, { request, answer: null, waiters: [], expiresAtMs: created + lifetimeMs, lastSeenMs: created });
    while (this.entries.size > MAX_REQUESTS) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    later(lifetimeMs, this.onChange);
    return request;
  }

  /**
   * Whether a request id is known (open, answered or recently expired).
   * @param id - request id
   * @returns true when known
   */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * A request by id.
   * @param id - request id
   * @returns the request, or undefined
   */
  get(id: string): PendingRequest | undefined {
    return this.entries.get(id)?.request;
  }

  /**
   * Open, unanswered requests whose hook is still waiting.
   * @param nowMs - current time, epoch milliseconds
   * @returns requests, oldest first
   */
  list(nowMs: number): PendingRequest[] {
    return [...this.entries.values()].filter((entry) => isOpen(entry, nowMs)).map((entry) => entry.request);
  }

  /**
   * Answer a request and wake the hook waiting on it.
   * @param id - request id
   * @param answer - the answer
   * @returns the outcome
   */
  answer(id: string, answer: RequestAnswer): AnswerOutcome {
    const entry = this.entries.get(id);
    const nowMs = this.now();
    if (!entry || entry.answer || entry.expiresAtMs <= nowMs) return 'gone';
    if (!isOpen(entry, nowMs)) return 'abandoned';
    entry.answer = answer;
    entry.waiters.splice(0).forEach((wake) => wake(answer));
    return 'answered';
  }

  /**
   * Wait for the answer to a request. Each wait marks the hook as still listening; a wait whose
   * connection drops (the hook died) marks it gone at once, so no answer is taken for it.
   * @param id - request id
   * @param timeoutMs - longest wait
   * @param signal - aborted when the hook's connection closes
   * @returns the answer, or null when none came in time
   */
  wait(id: string, timeoutMs: number, signal?: AbortSignal): Promise<RequestAnswer | null> {
    const entry = this.entries.get(id);
    if (!entry) return Promise.resolve(null);
    entry.lastSeenMs = this.now();
    if (entry.answer) return Promise.resolve(entry.answer);
    return new Promise((resolve) => {
      const finish = (answer: RequestAnswer | null, lastSeenMs: number): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        entry.waiters = entry.waiters.filter((waiter) => waiter !== wake);
        entry.lastSeenMs = lastSeenMs;
        resolve(answer);
      };
      const timer = setTimeout(() => {
        finish(null, this.now());
        later(POLL_GRACE_MS, this.onChange);
      }, timeoutMs);
      const onAbort = (): void => {
        finish(null, this.now() - POLL_GRACE_MS - 1);
        later(0, this.onChange);
      };
      const wake = (answer: RequestAnswer): void => finish(answer, this.now());
      entry.waiters.push(wake);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Withdraw a request because its hook gave up and Claude Code showed its own dialog.
   * @param id - request id
   * @returns true when a request was removed
   */
  cancel(id: string): boolean {
    return this.entries.delete(id);
  }

  /** Forget requests that expired a while ago. */
  private prune(): void {
    const cutoff = this.now() - FORGET_AFTER_MS;
    for (const [id, entry] of this.entries) if (entry.expiresAtMs < cutoff) this.entries.delete(id);
  }
}

/**
 * Whether a request can still be answered: not answered, not expired, and its hook is waiting or
 * polled within the grace period.
 * @param entry - stored request
 * @param nowMs - current time
 * @returns true when open
 */
function isOpen(entry: Entry, nowMs: number): boolean {
  if (entry.answer || entry.expiresAtMs <= nowMs) return false;
  return entry.waiters.length > 0 || nowMs - entry.lastSeenMs <= POLL_GRACE_MS;
}

/**
 * Call a function after a delay without keeping the process alive.
 * @param delayMs - delay
 * @param callback - function to call
 */
function later(delayMs: number, callback: () => void): void {
  setTimeout(callback, delayMs + 50).unref();
}

/**
 * Read the questions out of an AskUserQuestion tool input, keeping only well-formed ones and capping
 * their size.
 * @param input - the tool input
 * @returns questions
 */
export function parseQuestions(input: unknown): AgentQuestion[] {
  const raw = isObject(input) && Array.isArray(input.questions) ? input.questions : [];
  return raw
    .filter(isObject)
    .filter((entry) => typeof entry.question === 'string' && entry.question.trim())
    .slice(0, MAX_QUESTIONS)
    .map((entry) => ({
      question: text(entry.question),
      header: text(entry.header),
      multiSelect: entry.multiSelect === true,
      options: (Array.isArray(entry.options) ? entry.options : [])
        .filter(isObject)
        .filter((option) => typeof option.label === 'string')
        .slice(0, MAX_OPTIONS)
        .map((option): QuestionOption => ({ label: text(option.label), description: text(option.description) })),
    }));
}

/**
 * A string field, trimmed to a safe length.
 * @param value - any value
 * @returns text
 */
function text(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT) : '';
}

/**
 * Narrow to a plain object.
 * @param value - any value
 * @returns true for a non-null, non-array object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The full text of what a permission prompt would allow, so the card shows exactly what you approve:
 * the whole shell command (plus any inputs that change how it runs, such as a sandbox override; the
 * agent's own description of the command is left out), or every input of
 * any other tool as JSON. Only extreme sizes are cut, with a marker saying so; a cut request can be
 * denied here but must be allowed in the session, where all of it can be read.
 * @param tool - tool name
 * @param input - tool input
 * @returns detail text, and whether it was cut
 */
export function permissionDetail(tool: string, input: Record<string, unknown>): { detail: string; truncated: boolean } {
  const shell = (tool === 'Bash' || tool === 'PowerShell') && typeof input.command === 'string';
  const { command, description: _description, ...rest } = input;
  const text = shell ? [command as string, Object.keys(rest).length ? `\n${JSON.stringify(rest, null, 2)}` : ''].join('') : JSON.stringify(input, null, 2);
  if (text.length <= DETAIL_LIMIT) return { detail: text, truncated: false };
  return { detail: `${text.slice(0, DETAIL_LIMIT)}\n… ${text.length - DETAIL_LIMIT} more characters not shown`, truncated: true };
}
