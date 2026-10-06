import { readdir, readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionInfo } from '../shared/types.js';

/** How liveness is checked; injectable for tests. */
export interface LivenessDeps {
  isAlive: (pid: number) => boolean;
  procStartOf: (pid: number) => string | null;
}

const DEFAULT_DEPS: LivenessDeps = { isAlive: isPidAlive, procStartOf: readProcStart };
const SESSION_ID = /^[\w-]+$/;

/**
 * Sessions whose registry file exists and whose process is still the one that registered.
 * @param claudeDir - Claude Code config folder
 * @param deps - liveness checks
 * @returns live sessions
 */
export async function listLiveSessions(claudeDir: string, deps: LivenessDeps = DEFAULT_DEPS): Promise<SessionInfo[]> {
  const folder = join(claudeDir, 'sessions');
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  const entries = await Promise.all(names.filter((name) => name.endsWith('.json')).map((name) => readEntry(join(folder, name))));
  return entries.filter((entry): entry is RegistryEntry => entry !== null && isLive(entry, deps)).map(toInfo);
}

/**
 * Find a session's main transcript in any project folder.
 * @param claudeDir - Claude Code config folder
 * @param sessionId - session id
 * @returns transcript path, or null when not written yet
 */
export async function findTranscript(claudeDir: string, sessionId: string): Promise<string | null> {
  const projects = join(claudeDir, 'projects');
  let folders: string[];
  try {
    folders = await readdir(projects);
  } catch {
    return null;
  }
  for (const folder of folders) {
    const candidate = join(projects, folder, `${sessionId}.jsonl`);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Whether a process exists. EPERM means it exists but belongs to someone else.
 * @param pid - process id
 * @returns true when alive
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The process start time from a `/proc/<pid>/stat` line (field 22). The command name in field 2
 * may contain spaces and parentheses, so fields are counted from the last `)`.
 * @param statLine - contents of /proc/<pid>/stat
 * @returns start time, or null when unreadable
 */
export function parseProcStart(statLine: string): string | null {
  const close = statLine.lastIndexOf(')');
  if (close < 0) return null;
  return statLine.slice(close + 2).split(' ')[19] ?? null;
}

interface RegistryEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  kind: string;
  entrypoint: string;
  startedAt: number;
  procStart?: string;
}

/**
 * Read and validate one registry file.
 * @param path - registry file
 * @returns entry, or null when unreadable or malformed
 */
async function readEntry(path: string): Promise<RegistryEntry | null> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    if (typeof raw.pid !== 'number' || typeof raw.sessionId !== 'string' || !SESSION_ID.test(raw.sessionId)) return null;
    return {
      pid: raw.pid,
      sessionId: raw.sessionId,
      cwd: typeof raw.cwd === 'string' ? raw.cwd : '',
      kind: typeof raw.kind === 'string' ? raw.kind : '',
      entrypoint: typeof raw.entrypoint === 'string' ? raw.entrypoint : '',
      startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : 0,
      ...(typeof raw.procStart === 'string' ? { procStart: raw.procStart } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Alive, and not a different process that reused the pid.
 * @param entry - registry entry
 * @param deps - liveness checks
 * @returns true when live
 */
function isLive(entry: RegistryEntry, deps: LivenessDeps): boolean {
  if (!deps.isAlive(entry.pid)) return false;
  if (entry.procStart === undefined) return true;
  const actual = deps.procStartOf(entry.pid);
  return actual === null || actual === entry.procStart;
}

/**
 * The start time of a process on Linux; null elsewhere or when unreadable.
 * @param pid - process id
 * @returns start time
 */
export function readProcStart(pid: number): string | null {
  if (process.platform !== 'linux') return null;
  try {
    return parseProcStart(readFileSync(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Registry entry without its private fields.
 * @param entry - registry entry
 * @returns session info
 */
function toInfo(entry: RegistryEntry): SessionInfo {
  return { sessionId: entry.sessionId, pid: entry.pid, cwd: entry.cwd, kind: entry.kind, entrypoint: entry.entrypoint, startedAt: entry.startedAt };
}
