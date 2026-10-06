import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { readProcStart } from './registry.js';

/** Where a running Agent World with control on publishes its port and token for the hook. */
export const SERVER_FILE = join(homedir(), '.agent-world', 'server.json');

/** A private page that forwards the browser to the keyed link, so `--open` never puts the key on a command line. */
export const LAUNCHER_FILE = join(homedir(), '.agent-world', 'open.html');

/** What the hook reads from the server file. */
export interface ServerInfo {
  port: number;
  token: string;
  pid: number;
}

/**
 * Publish the port and token for the hook, readable only by you. The file is written beside its
 * final name and renamed into place, so the hook never reads a half-written or wider-permission file.
 * @param port - server port
 * @param token - access token
 * @param file - file path (tests pass a temporary one)
 */
export function writeServerFile(port: number, token: string, file = SERVER_FILE): void {
  const procStart = readProcStart(process.pid);
  writePrivate(file, JSON.stringify({ port, token, pid: process.pid, ...(procStart ? { procStart } : {}) }));
}

/**
 * Write the launcher page for `--open`: opening a file path keeps the key out of every process's
 * command line, which other users on the machine can read.
 * @param url - the keyed link
 * @param file - file path (tests pass a temporary one)
 * @returns the file path to open
 */
export function writeLauncher(url: string, file = LAUNCHER_FILE): string {
  const target = JSON.stringify(url).replace(/</g, '\\u003c');
  writePrivate(file, `<!doctype html><meta charset="utf-8"><title>Agent World</title><script>location.replace(${target});</script>\n`);
  return file;
}

/**
 * Write a file only you can read, in a folder only you can open, atomically.
 * @param file - file path
 * @param content - file content
 */
function writePrivate(file: string, content: string): void {
  const folder = dirname(file);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, content, { mode: 0o600, flag: 'w' });
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
}

/**
 * Remove the published file, but only if this process wrote it.
 * @param file - file path
 */
export function removeServerFile(file = SERVER_FILE): void {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { pid?: unknown };
    if (parsed.pid === process.pid) rmSync(file);
  } catch {
    return;
  }
}

/**
 * Remove the launcher page.
 * @param file - file path
 */
export function removeLauncher(file = LAUNCHER_FILE): void {
  rmSync(file, { force: true });
}

/**
 * Read the published file for the hook, trusting it only when it is a plain file you own that
 * nobody else can read or write, and the server that wrote it is still running (on Linux, the same
 * process: its start time must match, so a reused pid is not trusted).
 * @param file - file path
 * @returns port, token and pid, or null when missing or untrustworthy
 */
export function readServerFile(file = SERVER_FILE): ServerInfo | null {
  try {
    const stats = lstatSync(file);
    if (!stats.isFile() || (stats.mode & 0o077) !== 0) return null;
    if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<ServerInfo> & { procStart?: unknown };
    const { port, token, pid, procStart } = parsed;
    if (typeof port !== 'number' || typeof token !== 'string' || !token || typeof pid !== 'number') return null;
    if (!isRunning(pid)) return null;
    if (typeof procStart === 'string' && readProcStart(pid) !== procStart) return null;
    return { port, token, pid };
  } catch {
    return null;
  }
}

/**
 * Whether a process you own is running.
 * @param pid - process id
 * @returns true when it is alive and signalable by you
 */
function isRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
