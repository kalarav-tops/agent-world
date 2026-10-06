import { describe, expect, it } from 'vitest';
import { diffLines } from '../../src/shared/diff';
import { replayAt, timelineBounds } from '../../src/shared/replay';
import type { TimelineEntry } from '../../src/shared/types';
import { at } from '../fixtures/lines';

describe('diffLines', () => {
  it('marks unchanged, removed and added lines', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual({
      approximate: false,
      lines: [
        { type: 'same', text: 'a' },
        { type: 'del', text: 'b' },
        { type: 'add', text: 'x' },
        { type: 'same', text: 'c' },
      ],
    });
  });

  it('treats a new file as all additions', () => {
    expect(diffLines('', 'one\ntwo').lines).toEqual([
      { type: 'add', text: 'one' },
      { type: 'add', text: 'two' },
    ]);
  });

  it('falls back to remove-all/add-all when the inputs are too large', () => {
    const result = diffLines('a\nb', 'c\nd', 1);
    expect(result.approximate).toBe(true);
    expect(result.lines.map((line) => line.type)).toEqual(['del', 'del', 'add', 'add']);
  });
});

describe('replay', () => {
  const timeline: TimelineEntry[] = [
    { at: at(0), scientistId: 'main', status: 'thinking' },
    { at: at(5), scientistId: 'main', status: 'working', tool: 'Bash', summary: 'tests' },
    { at: at(6), scientistId: 'ag1', status: 'thinking' },
    { at: at(9), scientistId: 'main', status: 'done' },
  ];

  it('returns each scientist state at a moment', () => {
    expect(replayAt(timeline, Date.parse(at(5)))).toEqual({ main: { status: 'working', tool: 'Bash', summary: 'tests' } });
    expect(replayAt(timeline, Date.parse(at(7)))).toEqual({
      main: { status: 'working', tool: 'Bash', summary: 'tests' },
      ag1: { status: 'thinking', tool: undefined, summary: undefined },
    });
    expect(replayAt(timeline, Date.parse(at(-1)))).toEqual({});
  });

  it('reports the timeline bounds', () => {
    expect(timelineBounds(timeline)).toEqual({ start: Date.parse(at(0)), end: Date.parse(at(9)) });
    expect(timelineBounds([])).toEqual({ start: 0, end: 0 });
  });
});
