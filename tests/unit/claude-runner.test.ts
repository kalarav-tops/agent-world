import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findClaude, processRunner, readResult } from '../../src/server/claude-runner';

let folder: string;
let binary: string;

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'fake-claude-'));
  binary = join(folder, 'claude');
  writeFileSync(
    binary,
    [
      '#!/bin/sh',
      'case "$1" in',
      '  sleep) exec sleep 30 ;;',
      `  spawn) sh -c 'trap "" TERM; while true; do sleep 1; [ -f "$0" ] && echo alive > "$0"; done' "$2" & exec sleep 30 ;;`,
      `  json) echo '{"result":"hello"}' ;;`,
      '  fail) echo "boom" >&2; exit 3 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(binary, 0o755);
});

afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe('processRunner', () => {
  it('runs claude and keeps the tail of its output', async () => {
    const handle = processRunner(binary).start(['json'], folder, 10_000);
    expect(await handle.done).toBe(0);
    expect(handle.output()).toContain('"result":"hello"');
  });

  it('stops a run that goes past its time limit', async () => {
    const handle = processRunner(binary).start(['sleep'], folder, 100);
    expect(await handle.done).toBe(-1);
    expect(handle.output()).toContain('Stopped after');
  });

  it('stops every child when asked, as on shutdown', async () => {
    const runner = processRunner(binary);
    const handle = runner.start(['sleep'], folder, 60_000);
    const asking = expect(runner.ask(['sleep'], folder, 60_000)).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await runner.stop();
    expect(await handle.done).toBe(-1);
    await asking;
  });

  it('returns an explanation, and the last error line when claude fails', async () => {
    const runner = processRunner(binary);
    await expect(runner.ask(['json'], folder, 10_000)).resolves.toBe('hello');
    await expect(runner.ask(['fail'], folder, 10_000)).rejects.toThrow('boom');
    await expect(runner.ask(['sleep'], folder, 100)).rejects.toThrow('took too long');
  });

  it('stops the commands claude started too, even ones that ignore SIGTERM', async () => {
    const marker = join(folder, 'survivor');
    const handle = processRunner(binary).start(['spawn', marker], folder, 100);
    expect(await handle.done).toBe(-1);
    await new Promise((resolve) => setTimeout(resolve, 3_600));
    writeFileSync(marker, '');
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(readFileSync(marker, 'utf8')).toBe('');
  }, 10_000);

  it('kills everything at once on exit', async () => {
    const runner = processRunner(binary);
    const handle = runner.start(['sleep'], folder, 60_000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    runner.kill();
    expect(await handle.done).toBe(-1);
  });

  it('reports a missing executable as a failed run', async () => {
    const handle = processRunner(join(folder, 'missing')).start([], folder, 10_000);
    expect(await handle.done).toBe(-1);
  });
});

describe('findClaude and readResult', () => {
  it('prefers an explicit executable path', () => {
    expect(findClaude(binary)).toBe(binary);
  });

  it('reads the result field, or falls back to the raw text', () => {
    expect(readResult('{"result":"hi"}')).toBe('hi');
    expect(readResult('{"other":1}')).toBe('{"other":1}');
    expect(readResult(' plain \n')).toBe('plain');
  });
});
