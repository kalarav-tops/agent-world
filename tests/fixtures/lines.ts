/** Builders for transcript lines in the shape Claude Code writes them. */

let counter = 0;
let baseMs = Date.UTC(2026, 9, 6, 10, 0, 0);

/**
 * Move the base time. Unit tests keep the fixed default; end-to-end tests run against the real
 * clock, so they put the base a little ahead of it: pending work then never looks stuck or idle,
 * however long the suite runs.
 * @param ms - new base, epoch milliseconds
 */
export const setFixtureBase = (ms: number): void => {
  baseMs = ms;
};

/**
 * A timestamp a fixed number of seconds after the base time.
 * @param seconds - offset from the base
 * @returns ISO timestamp
 */
export const at = (seconds: number): string => new Date(baseMs + seconds * 1000).toISOString();

/**
 * A human prompt line.
 * @param text - prompt text
 * @param seconds - time offset
 * @returns transcript line
 */
export const humanPrompt = (text: string, seconds = 0): Record<string, unknown> => ({
  type: 'user',
  isSidechain: false,
  promptId: `prompt-${++counter}`,
  uuid: `u-${counter}`,
  origin: { kind: 'human' },
  message: { role: 'user', content: [{ type: 'text', text }] },
  timestamp: at(seconds),
  gitBranch: 'feature/x',
});

/**
 * An assistant line with one tool call.
 * @param id - tool use id
 * @param name - tool name
 * @param input - tool input
 * @param seconds - time offset
 * @returns transcript line
 */
export const toolUse = (id: string, name: string, input: Record<string, unknown>, seconds = 1): Record<string, unknown> => ({
  type: 'assistant',
  message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] },
  timestamp: at(seconds),
});

/**
 * A tool result line.
 * @param id - tool use id answered
 * @param seconds - time offset
 * @param extra - extra fields such as toolUseResult
 * @param isError - whether the tool failed
 * @returns transcript line
 */
export const toolResult = (id: string, seconds = 2, extra: Record<string, unknown> = {}, isError = false): Record<string, unknown> => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok', is_error: isError }] },
  timestamp: at(seconds),
  ...extra,
});

/**
 * An assistant text line.
 * @param text - text
 * @param final - whether it ends the turn
 * @param seconds - time offset
 * @returns transcript line
 */
export const assistantText = (text: string, final = true, seconds = 3): Record<string, unknown> => ({
  type: 'assistant',
  message: { role: 'assistant', stop_reason: final ? 'end_turn' : null, content: [{ type: 'text', text }] },
  timestamp: at(seconds),
});

/**
 * An assistant thinking line.
 * @param seconds - time offset
 * @returns transcript line
 */
export const thinking = (seconds = 1): Record<string, unknown> => ({
  type: 'assistant',
  message: { role: 'assistant', stop_reason: null, content: [{ type: 'thinking', thinking: '' }] },
  timestamp: at(seconds),
});

/**
 * The interruption marker line.
 * @param seconds - time offset
 * @returns transcript line
 */
export const interrupted = (seconds = 4): Record<string, unknown> => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] },
  timestamp: at(seconds),
});
