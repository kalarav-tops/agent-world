import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readConversation } from '../../src/server/conversation-file';
import { assistantText, humanPrompt } from '../fixtures/lines';
import { buildConversation } from '../../src/shared/conversation';
import type { WorldEvent } from '../../src/shared/types';

const AT = '2026-10-08T10:00:00.000Z';

describe('buildConversation', () => {
  it('turns events into prompts, replies and tool calls in order', () => {
    const events: WorldEvent[] = [
      { kind: 'prompt', at: AT, text: 'Add retries', promptId: 'p1' },
      { kind: 'thinking', at: AT },
      { kind: 'tool', at: AT, toolUseId: 't1', tool: 'Edit', summary: 'client.ts' },
      { kind: 'toolResult', at: AT, toolUseId: 't1', isError: false },
      { kind: 'tool', at: AT, toolUseId: 't2', tool: 'Bash', summary: 'npm test' },
      { kind: 'toolResult', at: AT, toolUseId: 't2', isError: true },
      { kind: 'tool', at: AT, toolUseId: 't3', tool: 'Read', summary: 'a.ts' },
      { kind: 'text', at: AT, text: 'Done: retries added.', final: true },
      { kind: 'meta', at: AT, model: 'x' },
    ];
    expect(buildConversation(events)).toEqual([
      { kind: 'prompt', at: AT, text: 'Add retries' },
      { kind: 'tool', at: AT, toolUseId: 't1', tool: 'Edit', summary: 'client.ts', state: 'done' },
      { kind: 'tool', at: AT, toolUseId: 't2', tool: 'Bash', summary: 'npm test', state: 'error' },
      { kind: 'tool', at: AT, toolUseId: 't3', tool: 'Read', summary: 'a.ts', state: 'running' },
      { kind: 'reply', at: AT, text: 'Done: retries added.' },
    ]);
  });

  it('skips empty text and keeps only the newest items', () => {
    const events: WorldEvent[] = Array.from({ length: 10 }, (_, index) => ({ kind: 'text', at: AT, text: index === 0 ? '  ' : `m${index}`, final: false }));
    expect(buildConversation(events, 3).map((item) => ('text' in item ? item.text : ''))).toEqual(['m7', 'm8', 'm9']);
  });
});

describe('readConversation', () => {
  it('reuses the last result while the transcript is unchanged, and rereads it after it grows', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'aw-conv-'));
    const path = join(folder, 's.jsonl');
    writeFileSync(path, `${JSON.stringify(humanPrompt('Hello', 0))}\n`);
    const first = await readConversation(path);
    expect(await readConversation(path)).toBe(first);
    appendFileSync(path, `${JSON.stringify(assistantText('Hi there', true, 1))}\n`);
    const grown = await readConversation(path);
    expect(grown).not.toBe(first);
    expect(grown.map((item) => item.kind)).toEqual(['prompt', 'reply']);
    rmSync(folder, { recursive: true, force: true });
  });
});
