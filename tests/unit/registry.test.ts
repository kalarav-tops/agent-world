import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findTranscript, isPidAlive, listLiveSessions, parseProcStart } from '../../src/server/registry';

describe('parseProcStart', () => {
  it('reads field 22 even when the command name has spaces and parentheses', () => {
    const fields = Array.from({ length: 30 }, (_, index) => String(index + 3));
    const stat = `1234 (my (odd) cmd) ${fields.join(' ')}`;
    expect(parseProcStart(stat)).toBe('22');
  });

  it('returns null for unreadable text', () => {
    expect(parseProcStart('garbage')).toBeNull();
  });
});

describe('isPidAlive', () => {
  it('is true for this process and false for an impossible pid', () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(2 ** 22 + 12345)).toBe(false);
  });
});

describe('listLiveSessions', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'registry-'));
    mkdirSync(join(dir, 'sessions'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /**
   * Write one registry file.
   * @param pid - session pid
   * @param extra - extra fields
   */
  const register = (pid: number, extra: Record<string, unknown> = {}): void => {
    const entry = { pid, sessionId: `s-${pid}`, cwd: '/w', kind: 'interactive', entrypoint: 'cli', startedAt: 5, procStart: '100', ...extra };
    writeFileSync(join(dir, 'sessions', `${pid}.json`), JSON.stringify(entry));
  };

  it('returns live sessions only', async () => {
    register(1);
    register(2);
    const sessions = await listLiveSessions(dir, { isAlive: (pid) => pid === 1, procStartOf: () => '100' });
    expect(sessions).toEqual([{ sessionId: 's-1', pid: 1, cwd: '/w', kind: 'interactive', entrypoint: 'cli', startedAt: 5 }]);
  });

  it('drops a session whose pid was reused by another process', async () => {
    register(1);
    expect(await listLiveSessions(dir, { isAlive: () => true, procStartOf: () => '999' })).toEqual([]);
  });

  it('trusts the pid when the start time cannot be read', async () => {
    register(1);
    expect(await listLiveSessions(dir, { isAlive: () => true, procStartOf: () => null })).toHaveLength(1);
  });

  it('rejects a session id that is not a plain id', async () => {
    register(1, { sessionId: '../../etc/passwd' });
    expect(await listLiveSessions(dir, { isAlive: () => true, procStartOf: () => null })).toEqual([]);
  });

  it('skips malformed registry files and other files', async () => {
    writeFileSync(join(dir, 'sessions', 'bad.json'), '{oops');
    writeFileSync(join(dir, 'sessions', '3.json'), JSON.stringify({ pid: 'x' }));
    writeFileSync(join(dir, 'sessions', '4.key'), 'k');
    expect(await listLiveSessions(dir, { isAlive: () => true, procStartOf: () => null })).toEqual([]);
  });

  it('returns nothing when the registry folder is missing', async () => {
    expect(await listLiveSessions(join(dir, 'nope'))).toEqual([]);
  });
});

describe('findTranscript', () => {
  it('finds the transcript in whichever project folder holds it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'find-'));
    mkdirSync(join(dir, 'projects', '-a'), { recursive: true });
    mkdirSync(join(dir, 'projects', '-b'), { recursive: true });
    writeFileSync(join(dir, 'projects', '-b', 'sid.jsonl'), '');
    expect(await findTranscript(dir, 'sid')).toBe(join(dir, 'projects', '-b', 'sid.jsonl'));
    expect(await findTranscript(dir, 'missing')).toBeNull();
    expect(await findTranscript(join(dir, 'none'), 'sid')).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
