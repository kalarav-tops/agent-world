import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readServerFile, removeLauncher, removeServerFile, writeLauncher, writeServerFile } from '../../src/server/server-file';

const TOKEN = 'f'.repeat(48);

describe('server file', () => {
  let home: string;
  let file: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'server-file-'));
    file = join(home, '.agent-world', 'server.json');
  });

  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('is written atomically, readable only by you, in a folder only you can open', () => {
    writeServerFile(4317, TOKEN, file);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, '.agent-world')).mode & 0o777).toBe(0o700);
    expect(readdirSync(join(home, '.agent-world'))).toEqual(['server.json']);
    expect(readServerFile(file)).toEqual({ port: 4317, token: TOKEN, pid: process.pid });
  });

  it('tightens a folder that already exists with wider permissions', () => {
    writeServerFile(1, TOKEN, file);
    chmodSync(join(home, '.agent-world'), 0o755);
    writeServerFile(2, TOKEN, file);
    expect(statSync(join(home, '.agent-world')).mode & 0o777).toBe(0o700);
  });

  it('is not trusted when others can read it', () => {
    writeServerFile(4317, TOKEN, file);
    chmodSync(file, 0o644);
    expect(readServerFile(file)).toBeNull();
  });

  it('is not trusted through a symbolic link', () => {
    writeServerFile(4317, TOKEN, file);
    const link = join(home, 'link.json');
    symlinkSync(file, link);
    expect(readServerFile(link)).toBeNull();
  });

  it('is not trusted when the server that wrote it is gone', () => {
    writeServerFile(4317, TOKEN, file);
    writeFileSync(file, JSON.stringify({ port: 4317, token: TOKEN, pid: 2 ** 22 + 7 }), { mode: 0o600 });
    expect(readServerFile(file)).toBeNull();
  });

  it.runIf(process.platform === 'linux')('is not trusted when a different process now has that pid', () => {
    writeServerFile(4317, TOKEN, file);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveProperty('procStart');
    writeFileSync(file, JSON.stringify({ port: 4317, token: TOKEN, pid: process.pid, procStart: '1' }), { mode: 0o600 });
    expect(readServerFile(file)).toBeNull();
  });

  it('writes a private launcher page that forwards to the keyed link', () => {
    const launcher = join(home, '.agent-world', 'open.html');
    expect(writeLauncher(`http://127.0.0.1:4317/#token=${TOKEN}</script>`, launcher)).toBe(launcher);
    expect(statSync(launcher).mode & 0o777).toBe(0o600);
    const html = readFileSync(launcher, 'utf8');
    expect(html).toContain(`location.replace("http://127.0.0.1:4317/#token=${TOKEN}\\u003c/script>")`);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    removeLauncher(launcher);
    expect(readdirSync(join(home, '.agent-world'))).toEqual([]);
  });

  it('is not trusted when malformed or missing', () => {
    expect(readServerFile(file)).toBeNull();
    writeServerFile(4317, TOKEN, file);
    writeFileSync(file, JSON.stringify({ port: '4317', token: TOKEN, pid: process.pid }));
    expect(readServerFile(file)).toBeNull();
  });

  it('is removed only by the process that wrote it', () => {
    writeServerFile(4317, TOKEN, file);
    writeFileSync(file, JSON.stringify({ port: 4317, token: TOKEN, pid: process.pid + 1 }), { mode: 0o600 });
    removeServerFile(file);
    expect(readdirSync(join(home, '.agent-world'))).toEqual(['server.json']);
    writeServerFile(4317, TOKEN, file);
    removeServerFile(file);
    expect(readdirSync(join(home, '.agent-world'))).toEqual([]);
  });
});
