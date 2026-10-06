import { describe, expect, it } from 'vitest';
import { askArgs, explanationQuestion, runArgs, validatePrompt, PROMPT_LIMIT } from '../../src/server/claude-args';
import { RequestStore, parseQuestions, permissionDetail } from '../../src/server/requests';
import { permissionOutput, questionOutput } from '../../src/server/hook-output';

describe('claude arguments', () => {
  it('starts a new task as a print-mode run with the chosen permission mode', () => {
    expect(runArgs({ prompt: 'fix the build', permissionMode: 'acceptEdits' })).toEqual(['-p', '--permission-mode', 'acceptEdits', 'fix the build']);
  });

  it('continues a session as a fork so the open session is never written into', () => {
    expect(runArgs({ prompt: 'now add tests', permissionMode: 'default', resumeSessionId: 's-1' })).toEqual([
      '-p',
      '--resume',
      's-1',
      '--fork-session',
      '--permission-mode',
      'default',
      'now add tests',
    ]);
  });

  it('asks a session about its work on a throwaway fork with no tools and no MCP servers', () => {
    expect(askArgs('s-1', 'what did you do?')).toEqual([
      '-p',
      '--resume',
      's-1',
      '--fork-session',
      '--no-session-persistence',
      '--tools',
      '',
      '--strict-mcp-config',
      '--output-format',
      'json',
      'what did you do?',
    ]);
  });

  it('accepts ordinary prompts and refuses empty, oversized, slash, bang and option-like prompts', () => {
    expect(validatePrompt('  fix it ')).toEqual({ ok: true, prompt: 'fix it' });
    expect(validatePrompt('   ')).toMatchObject({ ok: false });
    expect(validatePrompt('x'.repeat(PROMPT_LIMIT + 1))).toMatchObject({ ok: false });
    expect(validatePrompt('/compact')).toMatchObject({ ok: false });
    expect(validatePrompt('!ls')).toMatchObject({ ok: false });
    expect(validatePrompt(42)).toMatchObject({ ok: false });
    expect(validatePrompt('--dangerously-skip-permissions')).toMatchObject({ ok: false });
    expect(validatePrompt('  -p hi')).toMatchObject({ ok: false });
    expect(validatePrompt('fix the -p flag')).toMatchObject({ ok: true });
  });

  it('writes an explanation question for a lab and for one agent', () => {
    const lab = explanationQuestion({ labIndex: 3, prompt: 'Fix the flaky test' });
    expect(lab).toContain('Fix the flaky test');
    expect(lab).toContain('Explanation');
    expect(lab).toContain('Example');
    const agent = explanationQuestion({ labIndex: 3, prompt: 'Fix it', agent: { role: 'Explore', description: 'Find the cause' } });
    expect(agent).toContain('Explore');
    expect(agent).toContain('Find the cause');
  });
});

describe('parseQuestions', () => {
  it('reads AskUserQuestion input and drops malformed entries', () => {
    const questions = parseQuestions({
      questions: [
        { question: 'Which style?', header: 'Style', multiSelect: false, options: [{ label: 'A', description: 'first' }, { label: 'B' }, 7] },
        { header: 'no question' },
        'junk',
      ],
    });
    expect(questions).toEqual([
      {
        question: 'Which style?',
        header: 'Style',
        multiSelect: false,
        options: [
          { label: 'A', description: 'first' },
          { label: 'B', description: '' },
        ],
      },
    ]);
    expect(parseQuestions(null)).toEqual([]);
  });
});

describe('RequestStore', () => {
  const question = { question: 'Go?', header: 'Go', multiSelect: false, options: [{ label: 'Yes', description: '' }] };
  const permission = (summary: string) => ({ kind: 'permission' as const, sessionId: 's', tool: 'Bash', summary, detail: summary, truncated: false });

  it('lists open requests and hides expired ones', () => {
    const store = new RequestStore(() => 1000);
    const request = store.create({ kind: 'question', sessionId: 's', questions: [question] }, 60_000);
    expect(store.list(1000).map((entry) => entry.id)).toEqual([request.id]);
    expect(store.list(1000 + 61_000)).toEqual([]);
    expect(store.has(request.id)).toBe(true);
    expect(store.get(request.id)).toEqual(request);
    expect(store.has('nope')).toBe(false);
  });

  it('hands an answer to a waiting hook', async () => {
    const store = new RequestStore(() => Date.now());
    const request = store.create(permission('rm build'), 60_000);
    const waiting = store.wait(request.id, 5_000);
    expect(store.answer(request.id, { decision: 'allow' })).toBe('answered');
    await expect(waiting).resolves.toEqual({ decision: 'allow' });
    expect(store.list(Date.now())).toEqual([]);
  });

  it('returns an answer given between polls, and null after a timeout', async () => {
    const store = new RequestStore(() => Date.now());
    const early = store.create(permission('x'), 60_000);
    expect(store.answer(early.id, { decision: 'deny' })).toBe('answered');
    await expect(store.wait(early.id, 1000)).resolves.toEqual({ decision: 'deny' });
    const late = store.create(permission('y'), 60_000);
    await expect(store.wait(late.id, 20)).resolves.toBeNull();
  });

  it('refuses answers to unknown or already answered requests', () => {
    const store = new RequestStore(() => Date.now());
    const request = store.create(permission('x'), 60_000);
    expect(store.answer('nope', { decision: 'allow' })).toBe('gone');
    expect(store.answer(request.id, { decision: 'allow' })).toBe('answered');
    expect(store.answer(request.id, { decision: 'deny' })).toBe('gone');
  });

  it('refuses an answer once the hook has stopped polling, and drops the card', () => {
    let clock = 0;
    const store = new RequestStore(() => clock);
    const request = store.create(permission('x'), 60_000);
    clock = 4_000;
    expect(store.list(clock)).toHaveLength(1);
    clock = 10_000;
    expect(store.list(clock)).toEqual([]);
    expect(store.answer(request.id, { decision: 'allow' })).toBe('abandoned');
  });

  it('keeps a request open while a hook is waiting on it, however long the wait', async () => {
    let clock = 0;
    const store = new RequestStore(() => clock);
    const request = store.create(permission('x'), 60_000);
    const waiting = store.wait(request.id, 5_000);
    clock = 30_000;
    expect(store.list(clock)).toHaveLength(1);
    expect(store.answer(request.id, { decision: 'allow' })).toBe('answered');
    await expect(waiting).resolves.toEqual({ decision: 'allow' });
  });

  it('treats a dropped hook connection as gone at once, so no answer is taken for it', async () => {
    const store = new RequestStore(() => Date.now());
    const request = store.create(permission('x'), 60_000);
    const hookGone = new AbortController();
    const waiting = store.wait(request.id, 20_000, hookGone.signal);
    hookGone.abort();
    await expect(waiting).resolves.toBeNull();
    expect(store.list(Date.now())).toEqual([]);
    expect(store.answer(request.id, { decision: 'allow' })).toBe('abandoned');
    const again = store.wait(request.id, 20);
    expect(store.list(Date.now())).toHaveLength(1);
    await again;
  });

  it('withdraws a cancelled request', () => {
    const store = new RequestStore(() => Date.now());
    const request = store.create(permission('x'), 60_000);
    expect(store.cancel(request.id)).toBe(true);
    expect(store.cancel(request.id)).toBe(false);
    expect(store.list(Date.now())).toEqual([]);
    expect(store.answer(request.id, { decision: 'allow' })).toBe('gone');
  });

  it('reports a change when a request expires, so the page can drop its card', async () => {
    let changes = 0;
    const store = new RequestStore(() => Date.now(), () => (changes += 1));
    store.create(permission('x'), 10);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(changes).toBe(1);
  });

  it('caps how many requests it keeps', () => {
    const store = new RequestStore(() => Date.now());
    for (let index = 0; index < 120; index += 1) store.create(permission(String(index)), 60_000);
    expect(store.list(Date.now()).length).toBeLessThanOrEqual(50);
  });
});

describe('permissionDetail', () => {
  it('shows the whole shell command, plus inputs that change how it runs', () => {
    const command = `rm -rf build && ${'echo x; '.repeat(200)}`;
    expect(permissionDetail('Bash', { command, description: 'Clean up' })).toEqual({ detail: command, truncated: false });
    expect(permissionDetail('Bash', { command: 'ls', description: 'List', dangerouslyDisableSandbox: true }).detail).toBe('ls\n{\n  "dangerouslyDisableSandbox": true\n}');
  });

  it('shows every input of other tools, including full paths, URLs and MCP arguments', () => {
    expect(permissionDetail('WebFetch', { url: 'https://example.com/a/very/long/path?q=1', prompt: 'read' }).detail).toContain('https://example.com/a/very/long/path?q=1');
    expect(permissionDetail('mcp__db__query', { sql: 'DELETE FROM users' }).detail).toContain('DELETE FROM users');
  });

  it('cuts only extreme sizes, and says so', () => {
    const { detail, truncated } = permissionDetail('Write', { file_path: '/a', content: 'x'.repeat(20_000) });
    expect(truncated).toBe(true);
    expect(detail.length).toBeLessThan(8_100);
    expect(detail).toMatch(/more characters not shown$/);
  });
});

describe('hook output', () => {
  it('turns question answers into a deny whose reason carries the answers', () => {
    const output = questionOutput({ 'Which style?': 'Pixel art' });
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'The user answered your question in Agent World, so the question dialog was not shown. Their answers:\n- Which style?: Pixel art\nContinue using these answers.',
      },
    });
  });

  it('turns a permission decision into the PermissionRequest output', () => {
    expect(permissionOutput('allow')).toEqual({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
    expect(permissionOutput('deny')).toEqual({
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'The user denied this in Agent World.' } },
    });
  });
});
