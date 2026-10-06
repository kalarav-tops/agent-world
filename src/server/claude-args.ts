/** Longest prompt the command centre accepts. */
export const PROMPT_LIMIT = 20_000;

/** Permission modes a command-centre run may start in. */
export const PERMISSION_MODES = ['default', 'acceptEdits', 'plan'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

/** A prompt run: a new task, or a continuation of a session's work on a fork. */
export interface RunRequest {
  prompt: string;
  permissionMode: PermissionMode;
  resumeSessionId?: string;
}

/** The result of checking a prompt. */
export type PromptCheck = { ok: true; prompt: string } | { ok: false; reason: string };

/**
 * Arguments for `claude` to run a prompt non-interactively. Continuing a session always forks it, so
 * the session open in your editor or terminal is never written into.
 * @param request - prompt, permission mode and optional session to continue from
 * @returns argument list (no shell involved)
 */
export function runArgs(request: RunRequest): string[] {
  const resume = request.resumeSessionId ? ['--resume', request.resumeSessionId, '--fork-session'] : [];
  return ['-p', ...resume, '--permission-mode', request.permissionMode, request.prompt];
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
