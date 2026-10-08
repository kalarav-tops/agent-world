import { createHash } from 'node:crypto';
import { open, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { ProjectView } from '../shared/types.js';

/** Folders Claude Code worked in within this window count as recent projects. */
export const RECENT_MS = 30 * 24 * 3600 * 1000;

const HEAD_BYTES = 64 * 1024;
const DEFAULT_TTL_MS = 30_000;

/** A live session's folder and branch. */
export interface LiveProject {
  cwd: string;
  branch: string;
}

/** A project a fresh conversation may start in. The path never leaves the server. */
export interface KnownProject {
  id: string;
  cwd: string;
  name: string;
  branch: string;
  live: boolean;
  lastActive: number;
}

/**
 * A stable id for a project folder, so the browser can pick one without ever sending a path.
 * @param cwd - project folder
 * @returns 16 hex characters
 */
export function projectId(cwd: string): string {
  return createHash('sha256').update(cwd).digest('hex').slice(0, 16);
}

/**
 * Live session folders first, then every folder Claude Code worked in over the last 30 days, newest
 * first. A folder's path comes from the `cwd` recorded in its newest transcript, because the
 * project folder name is a lossy encoding of the path.
 * @param claudeDir - Claude Code config folder
 * @param live - live sessions' folders and branches
 * @param now - current time, epoch milliseconds
 * @returns known projects
 */
export async function scanProjects(claudeDir: string, live: LiveProject[], now: number): Promise<KnownProject[]> {
  const recent = await recentProjects(join(claudeDir, 'projects'), now);
  const byCwd = new Map<string, KnownProject>();
  for (const project of live) {
    const found = recent.find((candidate) => candidate.cwd === project.cwd);
    byCwd.set(project.cwd, { id: projectId(project.cwd), cwd: project.cwd, name: basename(project.cwd) || project.cwd, branch: project.branch || found?.branch || '', live: true, lastActive: now });
  }
  for (const project of recent.sort((left, right) => right.lastActive - left.lastActive)) {
    if (!byCwd.has(project.cwd)) byCwd.set(project.cwd, project);
  }
  return [...byCwd.values()];
}

/**
 * The project list for the browser: no paths.
 * @param project - known project
 * @returns view
 */
export function toView(project: KnownProject): ProjectView {
  return { id: project.id, name: project.name, branch: project.branch, live: project.live };
}

/** Caches the project scan for a short while; launches look projects up here by id. */
export class ProjectCatalog {
  private cached: { at: number; projects: KnownProject[] } | null = null;
  private readonly now: () => number;

  /**
   * @param options - Claude folder, live-session source, clock and cache lifetime
   */
  constructor(private readonly options: { claudeDir: string; live: () => LiveProject[]; now?: () => number; ttlMs?: number }) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Known projects, rescanned when the cache is older than its lifetime.
   * @returns projects
   */
  async list(): Promise<KnownProject[]> {
    const now = this.now();
    if (this.cached && now - this.cached.at < (this.options.ttlMs ?? DEFAULT_TTL_MS)) return this.cached.projects;
    const projects = await scanProjects(this.options.claudeDir, this.options.live(), now);
    this.cached = { at: now, projects };
    return projects;
  }

  /**
   * A project by id.
   * @param id - project id from the browser
   * @returns the project, or undefined
   */
  async find(id: string): Promise<KnownProject | undefined> {
    return (await this.list()).find((project) => project.id === id);
  }

  /** Forget the cached scan, so the next call rescans. */
  invalidate(): void {
    this.cached = null;
  }
}

/**
 * Projects from transcript folders changed within the recent window.
 * @param projectsDir - `<claudeDir>/projects`
 * @param now - current time
 * @returns recent projects, unsorted
 */
async function recentProjects(projectsDir: string, now: number): Promise<KnownProject[]> {
  let folders: string[];
  try {
    folders = await readdir(projectsDir);
  } catch {
    return [];
  }
  const found = await Promise.all(folders.map((folder) => projectFromFolder(join(projectsDir, folder), now)));
  return found.filter((project): project is KnownProject => project !== null);
}

/**
 * The project a transcript folder belongs to, from its newest transcript.
 * @param folder - one project folder
 * @param now - current time
 * @returns the project, or null when stale, empty or unreadable
 */
async function projectFromFolder(folder: string, now: number): Promise<KnownProject | null> {
  try {
    const names = (await readdir(folder)).filter((name) => name.endsWith('.jsonl'));
    const stamped = await Promise.all(names.map(async (name) => ({ path: join(folder, name), mtimeMs: (await stat(join(folder, name))).mtimeMs })));
    const newest = stamped.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
    if (!newest || now - newest.mtimeMs > RECENT_MS) return null;
    const head = await readHead(newest.path);
    if (!head.cwd) return null;
    return { id: projectId(head.cwd), cwd: head.cwd, name: basename(head.cwd) || head.cwd, branch: head.branch, live: false, lastActive: newest.mtimeMs };
  } catch {
    return null;
  }
}

/**
 * The first `cwd` and `gitBranch` in a transcript's first 64 KB.
 * @param path - transcript path
 * @returns folder and branch, empty when not found
 */
async function readHead(path: string): Promise<{ cwd: string; branch: string }> {
  const file = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await file.read(buffer, 0, HEAD_BYTES, 0);
    for (const raw of buffer.subarray(0, bytesRead).toString('utf8').split('\n')) {
      try {
        const line = JSON.parse(raw) as { cwd?: unknown; gitBranch?: unknown };
        if (typeof line.cwd === 'string' && line.cwd) return { cwd: line.cwd, branch: typeof line.gitBranch === 'string' ? line.gitBranch : '' };
      } catch {
        continue;
      }
    }
    return { cwd: '', branch: '' };
  } finally {
    await file.close();
  }
}
