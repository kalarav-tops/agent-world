import { describe, expect, it } from 'vitest';
import { applyMainEvents, applySubagentEvents, createSession, MAX_ACTIONS, MAX_CHANGE_TEXT, MAX_TIMELINE } from '../../src/server/world';
import { normalizeLine } from '../../src/server/normalize';
import type { Session, WorldEvent } from '../../src/shared/types';
import { assistantText, at, humanPrompt, interrupted, thinking, toolResult, toolUse } from '../fixtures/lines';

const info = { sessionId: 's1', pid: 1, cwd: '/home/dev/my-app', kind: 'interactive', entrypoint: 'cli', startedAt: 0 };

/**
 * Normalize a list of fixture lines into events.
 * @param lines - transcript lines
 * @returns events
 */
const events = (...lines: Record<string, unknown>[]): WorldEvent[] => lines.flatMap((line) => normalizeLine(line));

/**
 * The last lab of a session, failing the test when there is none.
 * @param session - session
 * @returns the lab
 */
const lastLab = (session: Session) => {
  const lab = session.labs.at(-1);
  if (!lab) throw new Error('no lab');
  return lab;
};

describe('createSession', () => {
  it('names the continent after the working directory', () => {
    const session = createSession(info);
    expect(session.project).toBe('my-app');
    expect(session.labs).toEqual([]);
  });
});

describe('applyMainEvents', () => {
  it('ignores activity before the first prompt', () => {
    const session = applyMainEvents(createSession(info), events(thinking()));
    expect(session.labs).toHaveLength(0);
  });

  it('opens one lab per human prompt with a thinking main scientist', () => {
    const session = applyMainEvents(createSession(info), events(humanPrompt('first'), assistantText('ok'), humanPrompt('second', 10)));
    expect(session.labs.map((lab) => [lab.index, lab.prompt])).toEqual([
      [1, 'first'],
      [2, 'second'],
    ]);
    const main = lastLab(session).scientists.main;
    expect(main).toMatchObject({ role: 'main', status: 'thinking', instruction: 'second', depth: 0, parentId: null });
  });

  it('tracks a tool call from start to result', () => {
    const base = applyMainEvents(createSession(info), events(humanPrompt('go'), toolUse('t1', 'Bash', { description: 'Run tests' })));
    expect(lastLab(base).scientists.main).toMatchObject({ status: 'working', current: { tool: 'Bash', summary: 'Run tests', since: at(1) } });

    const after = applyMainEvents(base, events(toolResult('t1')));
    const main = lastLab(after).scientists.main;
    expect(main?.status).toBe('thinking');
    expect(main?.current).toBeNull();
    expect(main?.actions).toEqual([{ at: at(1), toolUseId: 't1', tool: 'Bash', summary: 'Run tests', state: 'ok' }]);
  });

  it('marks a failed tool call as an error', () => {
    const session = applyMainEvents(createSession(info), events(humanPrompt('go'), toolUse('t1', 'Bash', {}), toolResult('t1', 2, {}, true)));
    expect(lastLab(session).scientists.main?.actions[0]?.state).toBe('error');
  });

  it('keeps the most recent still-running call as current when parallel calls overlap', () => {
    const session = applyMainEvents(
      createSession(info),
      events(humanPrompt('go'), toolUse('r1', 'Read', { file_path: '/a' }), toolUse('r2', 'Read', { file_path: '/b' }), toolResult('r2')),
    );
    expect(lastLab(session).scientists.main?.current?.toolUseId).toBe('r1');
  });

  it('shows asking while a question waits on the human', () => {
    const session = applyMainEvents(createSession(info), events(humanPrompt('go'), toolUse('q', 'AskUserQuestion', { questions: [{ question: 'A or B?' }] })));
    expect(lastLab(session).scientists.main?.status).toBe('asking');
  });

  it('finishes the scientist on a final text and keeps it as the report', () => {
    const session = applyMainEvents(createSession(info), events(humanPrompt('go'), assistantText('All fixed')));
    expect(lastLab(session).scientists.main).toMatchObject({ status: 'done', report: 'All fixed', lastText: 'All fixed' });
  });

  it('stays thinking on non-final text', () => {
    const session = applyMainEvents(createSession(info), events(humanPrompt('go'), assistantText('Checking', false)));
    expect(lastLab(session).scientists.main).toMatchObject({ status: 'thinking', report: '', lastText: 'Checking' });
  });

  it('records the model and effort the scientist works with', () => {
    const line = { ...assistantText('ok', false), effort: 'high', message: { model: 'claude-sonnet-5-5', stop_reason: null, content: [{ type: 'text', text: 'ok' }] } };
    const session = applyMainEvents(createSession(info), events(humanPrompt('go'), line));
    expect(lastLab(session).scientists.main).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'high' });
  });

  it('marks an interruption', () => {
    const session = applyMainEvents(createSession(info), events(humanPrompt('go'), toolUse('t', 'Bash', {}), interrupted()));
    expect(lastLab(session).scientists.main).toMatchObject({ status: 'interrupted', current: null });
  });

  it('puts edits on the changes board and the timeline', () => {
    const session = applyMainEvents(
      createSession(info),
      events(humanPrompt('go'), toolUse('e1', 'Edit', { file_path: '/a.ts', old_string: 'x', new_string: 'y' })),
    );
    const lab = lastLab(session);
    expect(lab.changes).toEqual([{ at: at(1), scientistId: 'main', toolUseId: 'e1', file: '/a.ts', op: 'edit', oldText: 'x', newText: 'y' }]);
    expect(lab.timeline.map((entry) => entry.status)).toEqual(['thinking', 'working']);
  });

  it('bumps the lab version on every change and never mutates the input', () => {
    const first = applyMainEvents(createSession(info), events(humanPrompt('go')));
    const frozen = JSON.stringify(first);
    const second = applyMainEvents(first, events(toolUse('t', 'Read', { file_path: '/a' })));
    expect(JSON.stringify(first)).toBe(frozen);
    expect(lastLab(second).version).toBeGreaterThan(lastLab(first).version);
  });

  it('caps the action feed and the timeline', () => {
    const many = Array.from({ length: MAX_TIMELINE + 10 }, (_, index) => toolUse(`t${index}`, 'Read', { file_path: '/a' }));
    const session = applyMainEvents(createSession(info), events(humanPrompt('go'), ...many));
    const lab = lastLab(session);
    expect(lab.scientists.main?.actions).toHaveLength(MAX_ACTIONS);
    expect(lab.timeline).toHaveLength(MAX_TIMELINE);
  });

  it('remembers spawn requests for the lab they were made in', () => {
    const session = applyMainEvents(
      createSession(info),
      events(humanPrompt('go'), toolUse('a1', 'Agent', { subagent_type: 'Explore', description: 'Find', prompt: 'Find routes' })),
    );
    expect(session.pendingSpawns.a1).toEqual({ labId: lastLab(session).id, parentId: 'main', spawn: { role: 'Explore', description: 'Find', instruction: 'Find routes' } });
  });

  it('links an agent id to its lab from the Agent tool result', () => {
    const session = applyMainEvents(
      createSession(info),
      events(humanPrompt('go'), toolUse('a1', 'Agent', { description: 'Find', prompt: 'p' }), toolResult('a1', 2, { toolUseResult: { agentId: 'ag1' } })),
    );
    expect(session.agentLabs.ag1).toBe(lastLab(session).id);
  });
});

describe('applySubagentEvents', () => {
  /**
   * A session whose first lab spawned agent ag1 through tool call a1.
   * @returns session
   */
  const spawned = (): Session =>
    applyMainEvents(
      createSession(info),
      events(humanPrompt('one'), toolUse('a1', 'Agent', { subagent_type: 'Explore', description: 'Find', prompt: 'Find routes' }), humanPrompt('two', 20)),
    );

  it('adds the subagent to the lab that spawned it, with its instruction', () => {
    const session = applySubagentEvents(spawned(), 'ag1', { agentType: 'Explore', description: 'Find', toolUseId: 'a1', spawnDepth: 1 }, events(thinking(5)));
    const lab = session.labs[0];
    expect(lab?.scientists.ag1).toMatchObject({ role: 'Explore', instruction: 'Find routes', parentId: 'main', depth: 1, status: 'thinking' });
    expect(session.labs[1]?.scientists.ag1).toBeUndefined();
  });

  it('finds the lab through the agent id when the meta has no tool use id', () => {
    const base = applyMainEvents(spawned(), events(toolResult('a1', 6, { toolUseResult: { agentId: 'ag1' } })));
    const session = applySubagentEvents(base, 'ag1', { agentType: 'Explore', description: 'Find' }, events(thinking(7)));
    expect(session.labs[0]?.scientists.ag1).toBeDefined();
  });

  it('starts a subagent with the model its Agent call asked for until its own lines say otherwise', () => {
    const base = applyMainEvents(
      createSession(info),
      events(humanPrompt('one'), toolUse('a9', 'Agent', { subagent_type: 'Explore', description: 'd', prompt: 'p', model: 'haiku' })),
    );
    const session = applySubagentEvents(base, 'ag9', { agentType: 'Explore', toolUseId: 'a9' }, events(thinking(3)));
    expect(lastLab(session).scientists.ag9?.model).toBe('haiku');
  });

  it('falls back to the newest lab when the spawn is unknown', () => {
    const session = applySubagentEvents(spawned(), 'zz', { agentType: 'Plan', description: 'Plan it' }, events(thinking(7)));
    expect(session.labs[1]?.scientists.zz).toMatchObject({ role: 'Plan', instruction: 'Plan it', parentId: 'main' });
  });

  it('records the subagent report and its edits', () => {
    const meta = { agentType: 'Explore', description: 'Find', toolUseId: 'a1' };
    const session = applySubagentEvents(
      spawned(),
      'ag1',
      meta,
      events(toolUse('e', 'Write', { file_path: '/r.md', content: 'r' }, 8), assistantText('Found 3 routes', true, 9)),
    );
    const lab = session.labs[0];
    expect(lab?.scientists.ag1).toMatchObject({ status: 'done', report: 'Found 3 routes' });
    expect(lab?.changes[0]).toMatchObject({ scientistId: 'ag1', file: '/r.md', op: 'write' });
  });

  it('places a nested subagent in its parent subagent lab', () => {
    const meta = { agentType: 'Explore', description: 'Find', toolUseId: 'a1' };
    const withParent = applySubagentEvents(spawned(), 'ag1', meta, events(toolUse('n1', 'Agent', { subagent_type: 'Plan', description: 'Sub', prompt: 'deeper' }, 8)));
    const session = applySubagentEvents(withParent, 'ag2', { agentType: 'Plan', description: 'Sub', toolUseId: 'n1', spawnDepth: 2 }, events(thinking(9)));
    expect(session.labs[0]?.scientists.ag2).toMatchObject({ parentId: 'ag1', depth: 2, instruction: 'deeper' });
  });

  it('ignores events when the session has no lab yet', () => {
    const session = applySubagentEvents(createSession(info), 'x', { agentType: 'Explore', description: 'd' }, events(thinking()));
    expect(session.labs).toHaveLength(0);
  });

  it('keeps the timeline in time order when subagent events arrive after later main events', () => {
    const meta = { agentType: 'Explore', description: 'Find', toolUseId: 'a1' };
    const base = applyMainEvents(
      createSession(info),
      events(humanPrompt('one'), toolUse('a1', 'Agent', { description: 'Find', prompt: 'p' }), assistantText('main done', true, 50)),
    );
    const session = applySubagentEvents(base, 'ag1', meta, events(toolUse('g', 'Grep', { pattern: 'x' }, 6), assistantText('found', true, 7)));
    const times = lastLab(session).timeline.map((entry) => Date.parse(entry.at));
    expect(times).toHaveLength(6);
    expect(times).toEqual([...times].sort((left, right) => left - right));
  });

  it('caps very large change text', () => {
    const huge = 'x'.repeat(MAX_CHANGE_TEXT + 500);
    const session = applyMainEvents(createSession(info), events(humanPrompt('go'), toolUse('w', 'Write', { file_path: '/big.txt', content: huge })));
    const change = lastLab(session).changes[0];
    expect(change?.newText.length).toBeLessThanOrEqual(MAX_CHANGE_TEXT + 100);
    expect(change?.truncated).toBe(true);
  });

  it('ignores prompt events inside a subagent transcript', () => {
    const session = applySubagentEvents(spawned(), 'ag1', { agentType: 'Explore', description: 'Find', toolUseId: 'a1' }, events(humanPrompt('should not open')));
    expect(session.labs).toHaveLength(2);
  });
});
