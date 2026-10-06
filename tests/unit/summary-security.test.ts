import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROMPT_PREVIEW, summarizeWorld, STALE_AFTER_MS } from '../../src/server/summary';
import { isAllowedHost, isAllowedOrigin, resolveStatic } from '../../src/server/security';
import { applyMainEvents, createSession } from '../../src/server/world';
import { normalizeLine } from '../../src/server/normalize';
import { assistantText, at, humanPrompt, toolUse } from '../fixtures/lines';

const info = { sessionId: 's1', pid: 1, cwd: '/w/app', kind: 'interactive', entrypoint: 'cli', startedAt: 0 };

describe('summarizeWorld', () => {
  const session = applyMainEvents(
    createSession(info),
    [humanPrompt('one'), assistantText('done'), humanPrompt('two', 10), toolUse('e', 'Edit', { file_path: '/a', old_string: 'a', new_string: 'b' }, 11)].flatMap(
      (line) => normalizeLine(line),
    ),
  );

  it('summarizes sessions, labs and scientists without heavy data', () => {
    const world = summarizeWorld([session], Date.parse(at(12)));
    const [summary] = world.sessions;
    expect(summary?.labs.map((lab) => [lab.prompt, lab.active, lab.changeCount])).toEqual([
      ['one', false, 0],
      ['two', true, 1],
    ]);
    expect(summary?.labs[1]?.scientists[0]).toMatchObject({ id: 'main', status: 'working', changeCount: 1 });
    expect(JSON.stringify(world)).not.toContain('oldText');
  });

  it('shows a long-silent working scientist as idle', () => {
    const world = summarizeWorld([session], Date.parse(at(11)) + STALE_AFTER_MS + 1);
    expect(world.sessions[0]?.labs[1]?.scientists[0]?.status).toBe('idle');
    expect(world.sessions[0]?.labs[1]?.active).toBe(false);
  });

  it('sends only a preview of long prompts', () => {
    const long = applyMainEvents(createSession(info), normalizeLine(humanPrompt('p'.repeat(PROMPT_PREVIEW + 400))));
    const prompt = summarizeWorld([long], 0).sessions[0]?.labs[0]?.prompt ?? '';
    expect(prompt.length).toBeLessThanOrEqual(PROMPT_PREVIEW + 1);
    expect(prompt.endsWith('…')).toBe(true);
  });

  it('orders continents by start time', () => {
    const later = createSession({ ...info, sessionId: 's2', startedAt: 9 });
    expect(summarizeWorld([later, session], 0).sessions.map((entry) => entry.sessionId)).toEqual(['s1', 's2']);
  });
});

describe('security', () => {
  it('accepts only loopback hosts on our port', () => {
    expect(isAllowedHost('127.0.0.1:4317', 4317)).toBe(true);
    expect(isAllowedHost('localhost:4317', 4317)).toBe(true);
    expect(isAllowedHost('evil.com:4317', 4317)).toBe(false);
    expect(isAllowedHost('127.0.0.1:9999', 4317)).toBe(false);
    expect(isAllowedHost(undefined, 4317)).toBe(false);
  });

  it('accepts only our own origin, an extra dev origin, or none', () => {
    expect(isAllowedOrigin('http://127.0.0.1:4317', 4317)).toBe(true);
    expect(isAllowedOrigin('http://localhost:4317', 4317)).toBe(true);
    expect(isAllowedOrigin(undefined, 4317)).toBe(true);
    expect(isAllowedOrigin('https://evil.com', 4317)).toBe(false);
    expect(isAllowedOrigin('http://localhost:5173', 4317)).toBe(false);
    expect(isAllowedOrigin('http://localhost:5173', 4317, ['http://localhost:5173'])).toBe(true);
  });

  it('resolves static paths inside the web folder only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html>');
    writeFileSync(join(dir, 'assets', 'a.js'), '');
    expect(resolveStatic(dir, '/assets/a.js')).toBe(join(dir, 'assets', 'a.js'));
    expect(resolveStatic(dir, '/')).toBe(join(dir, 'index.html'));
    expect(resolveStatic(dir, '/lab/123')).toBe(join(dir, 'index.html'));
    expect(resolveStatic(dir, '/../../etc/passwd')).toBe(join(dir, 'index.html'));
    expect(resolveStatic(dir, '/%2e%2e/%2e%2e/etc/passwd')).toBe(join(dir, 'index.html'));
    expect(resolveStatic(dir, '/%E0%A4%A')).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
