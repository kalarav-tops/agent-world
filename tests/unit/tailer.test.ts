import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonlTailer } from '../../src/server/tailer';

describe('JsonlTailer', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tailer-'));
    file = join(dir, 'a.jsonl');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns nothing while the file does not exist', async () => {
    const tailer = new JsonlTailer(file);
    expect(await tailer.readNew()).toEqual({ lines: [], reset: false });
  });

  it('reads complete lines and then only appended ones', async () => {
    writeFileSync(file, '{"n":1}\n{"n":2}\n');
    const tailer = new JsonlTailer(file);
    expect((await tailer.readNew()).lines).toEqual([{ n: 1 }, { n: 2 }]);
    expect((await tailer.readNew()).lines).toEqual([]);
    appendFileSync(file, '{"n":3}\n');
    expect((await tailer.readNew()).lines).toEqual([{ n: 3 }]);
  });

  it('holds a partial line until it is completed', async () => {
    writeFileSync(file, '{"n":1}\n{"n":');
    const tailer = new JsonlTailer(file);
    expect((await tailer.readNew()).lines).toEqual([{ n: 1 }]);
    appendFileSync(file, '2}\n');
    expect((await tailer.readNew()).lines).toEqual([{ n: 2 }]);
  });

  it('keeps a multi-byte character split across reads intact', async () => {
    const text = JSON.stringify({ t: 'héllo ✓' });
    const bytes = Buffer.from(`${text}\n`);
    writeFileSync(file, bytes.subarray(0, 10));
    const tailer = new JsonlTailer(file);
    expect((await tailer.readNew()).lines).toEqual([]);
    appendFileSync(file, bytes.subarray(10));
    expect((await tailer.readNew()).lines).toEqual([{ t: 'héllo ✓' }]);
  });

  it('reads a large backlog in bounded chunks without losing lines', async () => {
    const lines = Array.from({ length: 50 }, (_, n) => JSON.stringify({ n }));
    writeFileSync(file, `${lines.join('\n')}\n`);
    const tailer = new JsonlTailer(file, { chunkBytes: 64, maxChunksPerRead: 2 });
    const seen: unknown[] = [];
    for (let call = 0; call < 100 && seen.length < 50; call += 1) seen.push(...(await tailer.readNew()).lines);
    expect(seen).toEqual(lines.map((line) => JSON.parse(line) as unknown));
  });

  it('keeps a line longer than one chunk intact', async () => {
    const long = JSON.stringify({ text: 'y'.repeat(500) });
    writeFileSync(file, `${long}\n{"n":2}\n`);
    const tailer = new JsonlTailer(file, { chunkBytes: 64, maxChunksPerRead: 1 });
    const seen: unknown[] = [];
    for (let call = 0; call < 50 && seen.length < 2; call += 1) seen.push(...(await tailer.readNew()).lines);
    expect(seen).toEqual([{ text: 'y'.repeat(500) }, { n: 2 }]);
  });

  it('skips malformed lines', async () => {
    writeFileSync(file, 'not json\n{"ok":true}\n\n');
    expect((await new JsonlTailer(file).readNew()).lines).toEqual([{ ok: true }]);
  });

  it('starts over and reports a reset when the file shrinks', async () => {
    writeFileSync(file, '{"n":1}\n{"n":2}\n');
    const tailer = new JsonlTailer(file);
    await tailer.readNew();
    writeFileSync(file, '{"n":9}\n');
    expect(await tailer.readNew()).toEqual({ lines: [{ n: 9 }], reset: true });
  });
});
