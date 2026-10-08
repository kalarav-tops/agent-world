import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ShipLogEntry } from '../shared/types.js';
import { writePrivate } from './server-file.js';

/** Where the ship keeps its history; Agent World's own folder, never the Claude folder. */
export const SHIP_LOG_FILE = join(homedir(), '.agent-world', 'ship-log.json');

/** Most entries kept. */
export const SHIP_LOG_LIMIT = 200;

/** Longest prompt preview kept. */
export const PREVIEW_LIMIT = 280;

const STATES = new Set(['running', 'finished', 'failed']);

/**
 * Read the ship log. A missing file is an empty history; an unreadable one is logged and treated as
 * empty, and is replaced at the next write. Malformed entries are dropped, with a line saying so. Runs still marked running were cut off when an earlier
 * Agent World stopped, so they come back as failed.
 * @param file - log path (tests pass a temporary one)
 * @returns entries, newest first
 */
export function readShipLog(file = SHIP_LOG_FILE): ShipLogEntry[] {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') process.stderr.write(`agent-world: could not read the ship log ${file}: ${(error as Error).message}\n`);
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not a list');
    const entries = parsed.filter(isEntry);
    if (entries.length < parsed.length) process.stderr.write(`agent-world: dropped ${parsed.length - entries.length} malformed ship log entries from ${file}\n`);
    return entries.slice(0, SHIP_LOG_LIMIT).map((entry) => (entry.state === 'running' ? { ...entry, state: 'failed' as const, exitCode: null } : entry));
  } catch (error) {
    process.stderr.write(`agent-world: ignoring unreadable ship log ${file}: ${(error as Error).message}\n`);
    return [];
  }
}

/**
 * Write the ship log privately and atomically, newest entries only.
 * @param entries - entries, newest first
 * @param file - log path
 */
export function writeShipLog(entries: ShipLogEntry[], file = SHIP_LOG_FILE): void {
  writePrivate(file, JSON.stringify(entries.slice(0, SHIP_LOG_LIMIT)));
}

/**
 * A one-line preview of a prompt.
 * @param prompt - prompt text
 * @returns at most 280 characters
 */
export function previewOf(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LIMIT);
}

/**
 * Whether a parsed value is a well-formed entry.
 * @param value - parsed value
 * @returns true when every field has the right type
 */
function isEntry(value: unknown): value is ShipLogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  const text = ['id', 'projectName', 'promptPreview', 'model', 'effort', 'permissionMode', 'startedAt'].every((key) => typeof entry[key] === 'string');
  const nullableText = ['sessionId', 'projectId', 'endedAt'].every((key) => entry[key] === null || typeof entry[key] === 'string');
  return text && nullableText && (entry.kind === 'launch' || entry.kind === 'reply') && STATES.has(entry.state as string) && (entry.exitCode === null || typeof entry.exitCode === 'number');
}
