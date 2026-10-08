import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Conversation } from '../../src/web/ui/Conversation';
import { HistoryScreen } from '../../src/web/ship/HistoryScreen';
import { chooseProject, LaunchScreen } from '../../src/web/ship/LaunchScreen';
import { conversationFor } from '../../src/web/state/ship';
import type { ShipLogEntry } from '../../src/shared/types';

const AT = '2026-10-08T10:00:00.000Z';
const run = (overrides: Partial<ShipLogEntry> = {}): ShipLogEntry => ({ id: 'r1', kind: 'launch', sessionId: 's9', projectId: 'p', projectName: 'checkout', promptPreview: 'Add retries', model: 'sonnet', effort: 'high', permissionMode: 'default', startedAt: AT, endedAt: null, state: 'running', exitCode: null, ...overrides });

describe('Conversation', () => {
  it('shows prompts and replies as chat and tool calls on one line', () => {
    const markup = renderToStaticMarkup(createElement(Conversation, { error: null, items: [
      { kind: 'prompt', at: AT, text: 'Add retries' },
      { kind: 'tool', at: AT, toolUseId: 't', tool: 'Edit', summary: 'client.ts', state: 'error' },
      { kind: 'reply', at: AT, text: 'Done.' },
    ] }));
    expect(markup).toContain('chat__item--prompt');
    expect(markup).toContain('chat__item--reply');
    expect(markup).toMatch(/chat__tool chat__tool--error.*Edit.*client\.ts/);
  });

  it('says when the transcript is gone', () => {
    expect(renderToStaticMarkup(createElement(Conversation, { items: [], error: 'This conversation\'s transcript is gone.' }))).toContain('transcript is gone');
  });
});

describe('HistoryScreen', () => {
  it('lists runs with status dots and labels replies', () => {
    const markup = renderToStaticMarkup(createElement(HistoryScreen, { runs: [run(), run({ id: 'r2', kind: 'reply', state: 'failed', exitCode: 2 })], selectedId: null, onSelect: () => undefined, onGoToLab: () => undefined, sessions: [], now: Date.parse(AT) }));
    expect(markup).toContain('Add retries');
    expect(markup).toContain('Running');
    expect(markup).toContain('Failed (exit 2)');
    expect(markup).toContain('Reply · Add retries');
    expect(markup).not.toContain('Reply to');
  });

  it('says when nothing has been launched yet', () => {
    expect(renderToStaticMarkup(createElement(HistoryScreen, { runs: [], selectedId: null, onSelect: () => undefined, onGoToLab: () => undefined, sessions: [], now: 0 }))).toContain('Nothing launched yet');
  });
});

describe('chooseProject', () => {
  const projects = [{ id: 'a', name: 'a', branch: '', live: true }, { id: 'b', name: 'b', branch: '', live: false }];

  it('keeps the chosen project while it is still listed', () => {
    expect(chooseProject(projects, 'b')).toBe('b');
  });

  it('falls back to the first project when the chosen one left the list, or none is chosen', () => {
    expect(chooseProject(projects, 'gone')).toBe('a');
    expect(chooseProject(projects, '')).toBe('a');
    expect(chooseProject([], 'gone')).toBe('');
  });
});

describe('LaunchScreen', () => {
  it('explains an empty project list instead of showing an empty picker', () => {
    const markup = renderToStaticMarkup(createElement(LaunchScreen, { access: { enabled: true }, onLaunched: () => undefined }));
    expect(markup).toContain('No projects yet');
  });
});

describe('conversationFor', () => {
  it('shows a conversation only for the session it was loaded for', () => {
    const loaded = { sessionId: 's1', items: [{ kind: 'reply' as const, at: AT, text: 'old' }] };
    expect(conversationFor(loaded, 's1')).toHaveLength(1);
    expect(conversationFor(loaded, 's2')).toEqual([]);
  });
});
