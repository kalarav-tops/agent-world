import type { ScientistStatus } from '../../shared/types';

const STATUS_WORDS: Record<ScientistStatus, string> = {
  thinking: 'Thinking',
  working: 'Working',
  asking: 'Asking you',
  done: 'Done',
  interrupted: 'Stopped',
  idle: 'Idle',
};

const CLIENTS: Record<string, string> = {
  'claude-vscode': 'VS Code',
  cli: 'Terminal',
  'claude-desktop': 'Desktop',
  'sdk-ts': 'SDK',
  'sdk-py': 'SDK',
};

/**
 * A status as a person would say it.
 * @param status - scientist status
 * @param waiting - whether the call may be blocked on a permission prompt
 * @returns label
 */
export function statusLabel(status: ScientistStatus, waiting = false): string {
  return waiting ? 'Stuck over 20s, may need permission' : STATUS_WORDS[status];
}

/**
 * Which app a session runs in.
 * @param entrypoint - registry entrypoint
 * @returns label
 */
export function clientLabel(entrypoint: string): string {
  return CLIENTS[entrypoint] ?? (entrypoint || 'Claude Code');
}

/**
 * The display name of an agent role.
 * @param role - agent role
 * @returns label
 */
export function roleLabel(role: string): string {
  return role === 'main' ? 'Main agent' : role;
}

/**
 * Time since a moment, in the largest whole unit.
 * @param iso - ISO timestamp
 * @param now - current time, epoch milliseconds
 * @returns e.g. "4 min ago"
 */
export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ago`;
}

/**
 * How long a lab has run, or took: "45s", "58m", "1h 12m".
 * @param startIso - when the prompt arrived
 * @param endIso - now for a running lab, or its last activity for a finished one
 * @returns clock text
 */
export function labClock(startIso: string, endIso: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000));
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * The first line of a text, shortened.
 * @param text - text
 * @param max - most characters
 * @returns one-line preview
 */
export function preview(text: string, max = 90): string {
  const line = text.split('\n').find((candidate) => candidate.trim()) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * How many agents a lab has and how many are still at work (thinking, running a tool or asking).
 * @param scientists - the lab's scientists
 * @returns e.g. "21 agents, 2 working" or "1 agent"
 */
export function agentCount(scientists: ReadonlyArray<{ status: ScientistStatus }>): string {
  const total = scientists.length;
  const working = scientists.filter((scientist) => scientist.status === 'thinking' || scientist.status === 'working' || scientist.status === 'asking').length;
  const agents = `${total} agent${total === 1 ? '' : 's'}`;
  if (!working) return agents;
  return total === 1 ? `${agents}, working` : `${agents}, ${working} working`;
}
