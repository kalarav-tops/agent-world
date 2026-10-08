import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectCatalog, projectId, RECENT_MS, scanProjects, toView } from '../../src/server/projects';

const NOW = Date.UTC(2026, 9, 8, 10, 0, 0);
let claudeDir: string;

/**
 * Write one transcript in a project folder with a given modification time.
 * @param folder - project folder name under projects/
 * @param file - transcript file name
 * @param lines - JSONL lines
 * @param mtimeMs - modification time
 */
const transcript = (folder: string, file: string, lines: Record<string, unknown>[], mtimeMs: number): void => {
  const dir = join(claudeDir, 'projects', folder);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, file);
  writeFileSync(path, lines.map((line) => `${JSON.stringify(line)}\n`).join(''));
  utimesSync(path, mtimeMs / 1000, mtimeMs / 1000);
};

beforeEach(() => {
  claudeDir = mkdtempSync(join(tmpdir(), 'aw-projects-'));
});

afterEach(() => rmSync(claudeDir, { recursive: true, force: true }));

describe('projectId', () => {
  it('is a stable 16-character hex id', () => {
    expect(projectId('/work/app')).toMatch(/^[0-9a-f]{16}$/);
    expect(projectId('/work/app')).toBe(projectId('/work/app'));
    expect(projectId('/work/app')).not.toBe(projectId('/work/app2'));
  });
});

describe('scanProjects', () => {
  it('lists live projects first, then folders worked in over the last 30 days, newest first', async () => {
    transcript('-work-old', 'a.jsonl', [{ type: 'user', cwd: '/work/old', gitBranch: 'main' }], NOW - RECENT_MS - 1000);
    transcript('-work-api', 'b.jsonl', [{ type: 'summary' }, { type: 'user', cwd: '/work/api', gitBranch: 'dev' }], NOW - 5000);
    transcript('-work-web', 'c.jsonl', [{ type: 'user', cwd: '/work/web' }], NOW - 1000);
    const projects = await scanProjects(claudeDir, [{ cwd: '/work/live', branch: 'feature/x' }], NOW);
    expect(projects.map((project) => project.cwd)).toEqual(['/work/live', '/work/web', '/work/api']);
    expect(projects[0]).toMatchObject({ name: 'live', branch: 'feature/x', live: true });
    expect(projects[2]).toMatchObject({ name: 'api', branch: 'dev', live: false });
  });

  it('merges a live project with its transcript folder instead of listing it twice', async () => {
    transcript('-work-api', 'b.jsonl', [{ type: 'user', cwd: '/work/api', gitBranch: 'dev' }], NOW - 5000);
    const projects = await scanProjects(claudeDir, [{ cwd: '/work/api', branch: '' }], NOW);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ live: true, branch: 'dev' });
  });

  it('uses only the newest transcript of a folder and skips lines without a cwd', async () => {
    transcript('-work-api', 'old.jsonl', [{ type: 'user', cwd: '/work/api-old' }], NOW - 9000);
    transcript('-work-api', 'new.jsonl', [{ type: 'ai-title' }, 'not json', { type: 'user', cwd: '/work/api' }], NOW - 1000);
    const projects = await scanProjects(claudeDir, [], NOW);
    expect(projects.map((project) => project.cwd)).toEqual(['/work/api']);
  });

  it('returns live projects only when there is no projects folder', async () => {
    expect(await scanProjects(claudeDir, [{ cwd: '/work/live', branch: '' }], NOW)).toHaveLength(1);
  });
});

describe('ProjectCatalog', () => {
  it('caches the scan and finds a project by id', async () => {
    let calls = 0;
    const catalog = new ProjectCatalog({ claudeDir, live: () => (calls++, [{ cwd: '/work/live', branch: '' }]), now: () => NOW, ttlMs: 30_000 });
    await catalog.list();
    await catalog.list();
    expect(calls).toBe(1);
    expect((await catalog.find(projectId('/work/live')))?.cwd).toBe('/work/live');
    expect(await catalog.find('0000000000000000')).toBeUndefined();
    catalog.invalidate();
    await catalog.list();
    expect(calls).toBe(2);
  });

  it('never puts the path in the browser view', () => {
    const view = toView({ id: 'abc', cwd: '/home/me/secret', name: 'secret', branch: 'main', live: true, lastActive: NOW });
    expect(view).toEqual({ id: 'abc', name: 'secret', branch: 'main', live: true });
  });
});
