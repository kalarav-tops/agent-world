import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewOf, readShipLog, SHIP_LOG_LIMIT, writeShipLog } from '../../src/server/ship-log';
import type { ShipLogEntry } from '../../src/shared/types';

let folder: string;
let file: string;

const entry = (id: string, overrides: Partial<ShipLogEntry> = {}): ShipLogEntry => ({
  id,
  kind: 'launch',
  sessionId: `s-${id}`,
  projectId: 'p1',
  projectName: 'app',
  promptPreview: 'Add retries',
  model: 'sonnet',
  effort: '',
  permissionMode: 'default',
  startedAt: '2026-10-08T10:00:00.000Z',
  endedAt: null,
  state: 'finished',
  exitCode: 0,
  ...overrides,
});

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'aw-shiplog-'));
  file = join(folder, 'private', 'ship-log.json');
});

afterEach(() => rmSync(folder, { recursive: true, force: true }));

describe('ship log', () => {
  it('starts empty when there is no file', () => {
    expect(readShipLog(file)).toEqual([]);
  });

  it('round-trips entries in a private file and folder', () => {
    writeShipLog([entry('a'), entry('b')], file);
    expect(readShipLog(file).map((item) => item.id)).toEqual(['a', 'b']);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(folder, 'private')).mode & 0o777).toBe(0o700);
  });

  it('keeps only the newest entries', () => {
    writeShipLog(Array.from({ length: SHIP_LOG_LIMIT + 5 }, (_, index) => entry(String(index))), file);
    const kept = readShipLog(file);
    expect(kept).toHaveLength(SHIP_LOG_LIMIT);
    expect(kept[0]?.id).toBe('0');
  });

  it('marks runs left running by an earlier process as failed', () => {
    writeShipLog([entry('a', { state: 'running', exitCode: null })], file);
    expect(readShipLog(file)[0]).toMatchObject({ state: 'failed', exitCode: null });
  });

  it('survives a corrupt file and drops malformed entries', () => {
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    writeShipLog([entry('a')], file);
    writeFileSync(file, '{not json');
    expect(readShipLog(file)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ship log'));
    writeFileSync(file, JSON.stringify([entry('ok'), { id: 5 }, null]));
    expect(readShipLog(file).map((item) => item.id)).toEqual(['ok']);
    writeShipLog([entry('b')], file);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('keeps a short one-line preview of the prompt', () => {
    expect(previewOf(`  ${'x'.repeat(400)}`)).toHaveLength(280);
    expect(previewOf('one\ntwo')).toBe('one two');
  });
});

describe('ship log warnings', () => {
  it('says so on stderr when the file cannot be read, or entries are dropped', () => {
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mkdirSync(file, { recursive: true });
    expect(readShipLog(file)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not read the ship log'));
    rmSync(file, { recursive: true });
    warn.mockClear();
    writeShipLog([entry('a')], file);
    writeFileSync(file, JSON.stringify([entry('ok'), { id: 5 }]));
    readShipLog(file);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropped 1 malformed'));
    warn.mockRestore();
  });
});
