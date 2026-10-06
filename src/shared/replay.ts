import type { ScientistStatus, TimelineEntry } from './types.js';

/** A scientist's state at one moment of a replay. */
export interface ReplayState {
  status: ScientistStatus;
  tool: string | undefined;
  summary: string | undefined;
}

/**
 * Each scientist's latest state at or before a moment. Scientists that had not started yet are absent.
 * @param timeline - the lab timeline, oldest first
 * @param atMs - the moment, epoch milliseconds
 * @returns state by scientist id
 */
export function replayAt(timeline: TimelineEntry[], atMs: number): Record<string, ReplayState> {
  const states: Record<string, ReplayState> = {};
  for (const entry of timeline) {
    if (Date.parse(entry.at) > atMs) break;
    states[entry.scientistId] = { status: entry.status, tool: entry.tool, summary: entry.summary };
  }
  return states;
}

/**
 * First and last moment of a timeline, or zeros when it is empty.
 * @param timeline - the lab timeline, oldest first
 * @returns start and end, epoch milliseconds
 */
export function timelineBounds(timeline: TimelineEntry[]): { start: number; end: number } {
  const first = timeline[0];
  const last = timeline.at(-1);
  if (!first || !last) return { start: 0, end: 0 };
  return { start: Date.parse(first.at), end: Date.parse(last.at) };
}
