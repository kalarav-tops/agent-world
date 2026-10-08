#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { permissionOutput, questionOutput } from './hook-output.js';
import { hookSignature, NONCE_HEADER, PROOF_HEADER, secretMatches, serverProof, SIGNATURE_HEADER } from './security.js';
import { readServerFile, type ServerInfo } from './server-file.js';

const POLL_MS = 20_000;
const REQUEST_TIMEOUT_MS = 3_000;
const DEFAULT_WAIT_SECONDS = 120;
const LIFETIME_MARGIN_MS = 5_000;

/** The hook input fields this script reads. */
interface HookInput {
  session_id?: unknown;
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
  tool_use_id?: unknown;
}

/** A verified reply from Agent World. */
interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Claude Code hook for AskUserQuestion (PreToolUse) and PermissionRequest. It forwards the question
 * or permission prompt to Agent World and waits for your answer there. With no answer in time, or
 * when Agent World is not running with control on, it exits quietly and Claude Code shows its normal
 * dialog, so it never blocks your work.
 *
 * The token never leaves this process: each request carries a fresh nonce and its signature, and a
 * reply counts only when it proves the server knows the token too. The first request carries no
 * data, so the tool input is sent only to a server that has proved itself: a program squatting on
 * the port learns nothing and cannot forge an answer.
 */
async function main(): Promise<void> {
  const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput;
  const event = eventOf(input);
  const server = readServerFile();
  if (!event || !server || typeof input.session_id !== 'string') return;

  const base = `http://127.0.0.1:${server.port}`;
  const check = await call(server, `${base}/api/control`, {});
  if (check?.status !== 200 || check.body.enabled !== true) return;
  const created = await call(server, `${base}/api/hook-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event, sessionId: input.session_id, toolName: input.tool_name, toolInput: input.tool_input, ...(typeof input.tool_use_id === 'string' ? { toolUseId: input.tool_use_id } : {}) }),
  });
  const result = created?.status === 200 ? (created.body.result as { id?: unknown; lifetimeMs?: unknown } | undefined) : undefined;
  if (typeof result?.id !== 'string' || typeof result.lifetimeMs !== 'number') return;
  const requestUrl = `${base}/api/hook-requests/${encodeURIComponent(result.id)}`;
  const cancel = (): Promise<unknown> => call(server, requestUrl, { method: 'DELETE' });
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.once(signal, () => void cancel().finally(() => process.exit(0)));

  const deadline = Date.now() + Math.min(waitSeconds() * 1000, result.lifetimeMs - LIFETIME_MARGIN_MS);
  while (Date.now() < deadline) {
    const wait = Math.min(POLL_MS, deadline - Date.now());
    const reply = await call(server, `${requestUrl}/answer?wait=${wait}`, {}, wait + REQUEST_TIMEOUT_MS);
    if (reply?.status !== 200) break;
    const answer = reply.body.answer as { answers?: Record<string, string>; decision?: 'allow' | 'deny' } | null;
    if (answer?.answers) return print(questionOutput(answer.answers));
    if (answer?.decision) return print(permissionOutput(answer.decision));
  }
  await cancel();
}

/**
 * Which Agent World event a hook input is.
 * @param input - hook input
 * @returns 'question', 'permission', or null for anything else
 */
function eventOf(input: HookInput): 'question' | 'permission' | null {
  if (input.hook_event_name === 'PreToolUse' && input.tool_name === 'AskUserQuestion') return 'question';
  if (input.hook_event_name === 'PermissionRequest') return 'permission';
  return null;
}

/**
 * How long to wait for an answer before falling back to Claude Code's own dialog. The environment
 * variable can only shorten the wait: the server drops a request soon after the default anyway.
 * @returns seconds
 */
function waitSeconds(): number {
  const value = Number(process.env.AGENT_WORLD_WAIT_SECONDS);
  return Number.isFinite(value) && value > 0 ? Math.min(value, DEFAULT_WAIT_SECONDS) : DEFAULT_WAIT_SECONDS;
}

/**
 * Make a signed request and accept the reply only when the server proves it knows the token.
 * @param server - the running server's details
 * @param url - URL
 * @param init - fetch options
 * @param timeoutMs - request timeout
 * @returns status and parsed body, or null on any failure or a missing proof
 */
async function call(server: ServerInfo, url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Reply | null> {
  const nonce = randomBytes(16).toString('hex');
  const headers = { ...(init.headers as Record<string, string> | undefined), [NONCE_HEADER]: nonce, [SIGNATURE_HEADER]: hookSignature(server.token, nonce) };
  try {
    const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!secretMatches(response.headers.get(PROOF_HEADER), serverProof(server.token, nonce))) return null;
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  } catch {
    return null;
  }
}

/**
 * Write the hook's decision for Claude Code.
 * @param output - hook output JSON
 */
function print(output: unknown): void {
  process.stdout.write(JSON.stringify(output));
}

main().catch(() => undefined);
