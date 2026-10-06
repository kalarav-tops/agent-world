import { describe, expect, it } from 'vitest';
import { extractMeta, normalizeLine } from '../../src/server/normalize';
import { assistantText, at, humanPrompt, interrupted, thinking, toolResult, toolUse } from '../fixtures/lines';

describe('normalizeLine', () => {
  it('ignores non-objects and unknown line types', () => {
    expect(normalizeLine(null)).toEqual([]);
    expect(normalizeLine('text')).toEqual([]);
    expect(normalizeLine({ type: 'attachment', attachment: { type: 'date' } })).toEqual([]);
    expect(normalizeLine({ type: 'ai-title', aiTitle: 'x' })).toEqual([]);
  });

  it('turns a human prompt into a prompt event with cleaned text', () => {
    const line = humanPrompt('<system-reminder>ctx</system-reminder>fix the build');
    expect(normalizeLine(line)).toEqual([{ kind: 'prompt', at: at(0), text: 'fix the build', promptId: line.promptId }]);
  });

  it('accepts turnOrigin human and a string content', () => {
    const line = { type: 'user', turnOrigin: 'human', uuid: 'u1', message: { content: 'hello' }, timestamp: at(0) };
    expect(normalizeLine(line)).toEqual([{ kind: 'prompt', at: at(0), text: 'hello', promptId: 'u1' }]);
  });

  it('does not open a lab for meta, task-notification or sidechain prompts', () => {
    expect(normalizeLine({ ...humanPrompt('x'), isMeta: true })).toEqual([]);
    expect(normalizeLine({ type: 'user', origin: { kind: 'task-notification' }, message: { content: 'done' } })).toEqual([]);
    expect(normalizeLine({ type: 'user', isSidechain: true, message: { content: 'Review this' } })).toEqual([]);
  });

  it('emits an interrupt event', () => {
    expect(normalizeLine(interrupted())).toEqual([{ kind: 'interrupt', at: at(4) }]);
    expect(normalizeLine({ type: 'user', message: { content: '[Request interrupted by user for tool use]' }, timestamp: at(4) })).toEqual([
      { kind: 'interrupt', at: at(4) },
    ]);
  });

  it('emits thinking and text events', () => {
    expect(normalizeLine(thinking())).toEqual([{ kind: 'thinking', at: at(1) }]);
    expect(normalizeLine(assistantText('done!'))).toEqual([{ kind: 'text', at: at(3), text: 'done!', final: true }]);
    expect(normalizeLine(assistantText('working', false))).toEqual([{ kind: 'text', at: at(3), text: 'working', final: false }]);
  });

  it('emits a tool event with a summary', () => {
    expect(normalizeLine(toolUse('t1', 'Bash', { command: 'ls', description: 'List' }))).toEqual([
      { kind: 'tool', at: at(1), toolUseId: 't1', tool: 'Bash', summary: 'List' },
    ]);
  });

  it('records an Edit as a change', () => {
    const [event] = normalizeLine(toolUse('t2', 'Edit', { file_path: '/a/b.ts', old_string: 'a', new_string: 'b' }));
    expect(event).toMatchObject({ kind: 'tool', change: { file: '/a/b.ts', op: 'edit', oldText: 'a', newText: 'b' } });
  });

  it('records Write, MultiEdit and NotebookEdit as changes', () => {
    expect(normalizeLine(toolUse('w', 'Write', { file_path: '/n.ts', content: 'x' }))[0]).toMatchObject({
      change: { file: '/n.ts', op: 'write', oldText: '', newText: 'x' },
    });
    expect(
      normalizeLine(toolUse('m', 'MultiEdit', { file_path: '/m.ts', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'd' }] }))[0],
    ).toMatchObject({ change: { file: '/m.ts', op: 'edit', oldText: 'a\nc', newText: 'b\nd' } });
    expect(normalizeLine(toolUse('nb', 'NotebookEdit', { notebook_path: '/x.ipynb', new_source: 'print(1)' }))[0]).toMatchObject({
      change: { file: '/x.ipynb', op: 'edit', oldText: '', newText: 'print(1)' },
    });
  });

  it('records an Agent call as a spawn request', () => {
    const [event] = normalizeLine(toolUse('a1', 'Agent', { subagent_type: 'Explore', description: 'Find routes', prompt: 'Look for routes' }));
    expect(event).toMatchObject({ kind: 'tool', spawn: { role: 'Explore', description: 'Find routes', instruction: 'Look for routes' } });
    const [fallback] = normalizeLine(toolUse('a2', 'Task', { description: 'x', prompt: 'y' }));
    expect(fallback).toMatchObject({ spawn: { role: 'general-purpose' } });
  });

  it('emits tool results with error flag and spawned agent id', () => {
    expect(normalizeLine(toolResult('t1', 2, { toolUseResult: { agentId: 'abc' } }))).toEqual([
      { kind: 'toolResult', at: at(2), toolUseId: 't1', isError: false, agentId: 'abc' },
    ]);
    expect(normalizeLine(toolResult('t9', 2, {}, true))).toEqual([{ kind: 'toolResult', at: at(2), toolUseId: 't9', isError: true }]);
  });

  it('emits one event per block of a multi-block assistant message', () => {
    const line = {
      type: 'assistant',
      timestamp: at(5),
      message: {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Reading both' },
          { type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/a' } },
          { type: 'tool_use', id: 'r2', name: 'Read', input: { file_path: '/b' } },
          { type: 'image' },
        ],
      },
    };
    expect(normalizeLine(line).map((event) => event.kind)).toEqual(['text', 'tool', 'tool']);
  });

  it('reports the model and effort an assistant line was produced with', () => {
    const line = { ...thinking(), effort: 'xhigh', message: { model: 'claude-opus-5-5', stop_reason: null, content: [{ type: 'thinking' }] } };
    expect(normalizeLine(line)).toEqual([
      { kind: 'meta', at: at(1), model: 'claude-opus-5-5', effort: 'xhigh' },
      { kind: 'thinking', at: at(1) },
    ]);
  });

  it('ignores the synthetic model and absent effort', () => {
    const line = { type: 'assistant', timestamp: at(1), message: { model: '<synthetic>', content: [{ type: 'text', text: 'x' }] } };
    expect(normalizeLine(line).map((event) => event.kind)).toEqual(['text']);
  });

  it('keeps the model an Agent call asks for', () => {
    const [event] = normalizeLine(toolUse('a', 'Agent', { subagent_type: 'Plan', description: 'd', prompt: 'p', model: 'haiku' }));
    expect(event).toMatchObject({ spawn: { role: 'Plan', model: 'haiku' } });
  });

  it('skips malformed blocks without throwing', () => {
    const line = { type: 'assistant', message: { content: [null, 5, { type: 'tool_use' }, { type: 'text' }] } };
    expect(() => normalizeLine(line)).not.toThrow();
  });
});

describe('extractMeta', () => {
  it('reads the branch and the AI title', () => {
    expect(extractMeta(humanPrompt('x'))).toEqual({ branch: 'feature/x' });
    expect(extractMeta({ type: 'ai-title', aiTitle: 'Fix build' })).toEqual({ title: 'Fix build' });
    expect(extractMeta(null)).toEqual({});
  });
});
