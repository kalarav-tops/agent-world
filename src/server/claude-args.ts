/** Longest prompt the command centre accepts. */
export const PROMPT_LIMIT = 20_000;

/** Permission modes a command-centre run may start in. */
export const PERMISSION_MODES = ['default', 'acceptEdits', 'plan'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

/** A follow-up to a session, run on a fork, optionally with a session id chosen here. */
export interface RunRequest {
  prompt: string;
  permissionMode: PermissionMode;
  resumeSessionId: string;
  newSessionId?: string;
}

/** The result of checking a prompt. */
export type PromptCheck = { ok: true; prompt: string } | { ok: false; reason: string };

/**
 * Arguments for `claude` to continue a session non-interactively. It always forks, so the session
 * open in your editor or terminal is never written into.
 * @param request - prompt, permission mode, the session to continue and an optional id for the fork
 * @returns argument list (no shell involved)
 */
export function runArgs(request: RunRequest): string[] {
  const id = request.newSessionId ? ['--session-id', request.newSessionId] : [];
  return ['-p', '--resume', request.resumeSessionId, '--fork-session', ...id, '--permission-mode', request.permissionMode, request.prompt];
}

/**
 * Arguments for `claude` to ask a session about its own work: a throwaway fork with no built-in tools
 * and no MCP servers, whose transcript is never saved, answering as JSON.
 * @param sessionId - session to ask
 * @param question - the question
 * @returns argument list (no shell involved)
 */
export function askArgs(sessionId: string, question: string): string[] {
  return ['-p', '--resume', sessionId, '--fork-session', '--no-session-persistence', '--tools', '', '--strict-mcp-config', '--output-format', 'json', question];
}

/**
 * Check a prompt from the browser. Commands (`/…`) and shell escapes (`!…`) are refused because
 * Claude Code would not run them from a script anyway, and a leading `-` is refused because the
 * prompt is a command-line argument and would be read as an option.
 * @param value - raw prompt value
 * @returns the trimmed prompt, or why it was refused
 */
export function validatePrompt(value: unknown): PromptCheck {
  if (typeof value !== 'string') return { ok: false, reason: 'The prompt must be text.' };
  const prompt = value.trim();
  if (!prompt) return { ok: false, reason: 'Write a prompt first.' };
  if (prompt.length > PROMPT_LIMIT) return { ok: false, reason: `Prompts are limited to ${PROMPT_LIMIT} characters.` };
  if (prompt.startsWith('/') || prompt.startsWith('!')) {
    return { ok: false, reason: 'Slash commands and ! shell commands only work typed in the session itself.' };
  }
  if (prompt.startsWith('-')) return { ok: false, reason: 'A prompt cannot start with "-"; reword its first line.' };
  return { ok: true, prompt };
}

/** What to ask about: a lab, or one agent in it. */
export interface ExplanationTarget {
  labIndex: number;
  prompt: string;
  agent?: { role: string; description: string };
}

/**
 * The question sent to a session to explain a lab's (or one agent's) work in a fixed shape.
 * @param target - the lab and optional agent
 * @returns question text
 */
export function explanationQuestion(target: ExplanationTarget): string {
  const subject = target.agent
    ? `the "${target.agent.role}" subagent you ran for "${target.agent.description}" while handling this request`
    : 'your work on this request';
  return [
    `Look back at this request from earlier in our conversation (request ${target.labIndex}):`,
    `"""${target.prompt.slice(0, 2000)}"""`,
    `Summarise ${subject} for a teammate, using exactly these headings:`,
    'Explanation: what the task was and how it was approached, in 2-4 sentences.',
    'Example: one concrete example from the work (a file, a change, a finding or a command), with a short snippet if useful.',
    'What it fixed or worked on: a short bullet list.',
    'Do not use any tools; answer only from what you already know.',
  ].join('\n');
}

/** Models a fresh conversation may use (aliases for the latest of each family). */
export const MODELS = ['opus', 'sonnet', 'haiku', 'fable'] as const;
export type ModelAlias = (typeof MODELS)[number];

/** Effort levels a fresh conversation may use. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EffortLevel = (typeof EFFORTS)[number];

/** A fresh conversation started from the ship. */
export interface LaunchRequest {
  sessionId: string;
  prompt: string;
  permissionMode: PermissionMode;
  model?: ModelAlias;
  effort?: EffortLevel;
}

/**
 * Arguments for `claude` to start a fresh conversation with a session id chosen here, so its
 * transcript is known before its first line is written.
 * @param request - session id, checked prompt and options
 * @returns argument list (no shell involved)
 */
export function launchArgs(request: LaunchRequest): string[] {
  return [
    '-p',
    '--session-id', request.sessionId,
    '--name', sessionName(request.prompt),
    '--permission-mode', request.permissionMode,
    ...(request.model ? ['--model', request.model] : []),
    ...(request.effort ? ['--effort', request.effort] : []),
    request.prompt,
  ];
}

/**
 * A session's display name: the first non-empty line of its prompt, at most 60 characters. A
 * checked prompt never starts with "-", so neither does its name.
 * @param prompt - checked prompt
 * @returns name
 */
export function sessionName(prompt: string): string {
  const line = prompt.split('\n').map((candidate) => candidate.trim()).find(Boolean) ?? '';
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}
