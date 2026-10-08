# Command Centre Ship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the command-centre drawer with a 3D ship reached through a warp tunnel from a launch-tower island. The ship starts fresh `claude -p` conversations and shows their history. Follow-ups, agent questions and permissions move into the world's panels.

**Architecture:** The server gains a project catalogue, a launch endpoint, a persistent ship log and a conversation endpoint, all inside the existing `ControlService` / `control-routes.ts` / `http.ts` structure. The web app gains a place state machine (`world → warping-in → ship → warping-out`) that swaps the world `<Canvas>` for a ship `<Canvas>`. Request forms and a reply box move into `InspectPanel`, and the drawer and request cards are deleted.

**Tech Stack:** Node 24, TypeScript, `ws`; React 19, React Three Fiber 9, drei 10, three 0.186; Vitest 5; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-command-centre-ship-design.md`

## Global Constraints

- Node: `export PATH=/home/tops/.nvm/versions/node/v24.20.0/bin:$PATH` before every command; plain `node` is 20.17 and too old.
- No new dependencies; `npm install` and edits to `package-lock.json` are blocked.
- Every `/api/*` request and `/ws` keeps the per-start access key; `/api/control` returns only `{enabled}`.
- The browser never sends a filesystem path; launch folders come only from the server's own project list, by id.
- Prompts: `validatePrompt` (≤ 20,000 chars; no leading `/`, `!` or `-`). Permission modes: `default`, `acceptEdits`, `plan`. Models: `opus`, `sonnet`, `haiku`, `fable`. Efforts: `low`, `medium`, `high`, `xhigh`, `max`.
- Run limits are unchanged: 3 at once, 30 minutes each, own process group, killed on stop.
- The ship log lives at `~/.agent-world/ship-log.json`: mode 600, written atomically, folder mode 700, newest 200 entries, prompt preview at most 280 characters.
- Nothing is ever written under the Claude config folder.
- drei `<Html>` always renders through `src/web/scene/Label.tsx`.
- Keep every existing button's accessible name; keep `.lab-tag--lit` and `.hud__stats`.
- Integration and E2E fixtures call `setFixtureBase(Date.now() + 120_000)`.
- Comments are JSDoc blocks above functions only, matching the existing files. 2-space indent, single quotes, semicolons.
- Gates after every task: `npm run typecheck`, `npx vitest run`, and `npm run build`. Tasks touching `src/web` also run `npm run test:e2e` with `PW_CHROMIUM_PATH=$(ls ~/.cache/ms-playwright/chromium-1234/*/chrome | head -1)`.
- Commit after each task with explicit paths (never `git add -A`). Never push without the user's approval. Never create a git worktree.
- The repo is public: screenshots only from the made-up demo world.

## Review Focus

1. **A launch whose project folder was deleted after the list loaded.** Expect a 404 with "That project folder no longer exists" and no `claude` process; tested in Task 4.
2. **The ship log was hand-edited into invalid JSON, or an entry is missing fields.** Expect startup with empty history, one stderr line and no crash, then a valid file at the next write; tested in Task 3.
3. **A conversation request for a session id that is neither live nor in the ship log, including `../` shapes.** Expect a 404 and no file read outside `<claudeDir>/projects`; tested in Task 5.
4. **Two agents in one session waiting at once, with no `tool_use_id` in the hook input.** Expect neither to be guessed: both requests go to the lab's "Waiting on you" section; tested in Task 7.
5. **Escape on the ship while typing a prompt.** Expect the text to stay and the warp not to start; tested in Task 13.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/server/projects.ts` | new | Scan live and recent project folders; ids; 30 s cache |
| `src/server/ship-log.ts` | new | Read and write `~/.agent-world/ship-log.json` |
| `src/shared/conversation.ts` | new | Pure: `WorldEvent[]` → chat items |
| `src/server/conversation-file.ts` | new | Read the tail of a transcript and build its conversation |
| `src/server/claude-args.ts` | modify | `launchArgs`, `MODELS`, `EFFORTS`, `sessionName`; `runArgs` becomes continue-only |
| `src/server/control.ts` | modify | `launch()`, continue-only `startRun()`, ship log, `hasLogged()` |
| `src/server/control-routes.ts` | modify | `POST /api/launches`, `GET /api/projects` |
| `src/server/http.ts` | modify | `GET /api/conversations/:sessionId` |
| `src/server/engine.ts` | modify | `liveSessions()`, `transcriptPath()`, `claudeDir` getter |
| `src/server/server-file.ts` | modify | Export `writePrivate` |
| `src/server/hook.ts`, `src/server/requests.ts` | modify | Carry `tool_use_id` (questions only) |
| `src/server/cli.ts` | modify | Wire `ProjectCatalog` and the ship log |
| `src/shared/types.ts` | modify | `ShipLogEntry`, `ProjectView`, `ConversationItem`, `PendingRequest.toolUseId`; remove `ControlRun` |
| `src/web/state/requests.ts` | new | Pure: match requests to agents |
| `src/web/state/place.ts` | new | Pure place state machine and warp timing |
| `src/web/state/ship.ts` | new | Hooks: projects, conversation polling |
| `src/web/ui/RequestForm.tsx` | new | Question / permission form (moved from `RequestCards.tsx`) |
| `src/web/ui/ReplyBox.tsx` | new | "Reply to this session" |
| `src/web/ui/Conversation.tsx` | new | Chat reader |
| `src/web/ui/InspectPanel.tsx` | modify | Waiting on you, request form in agent view, reply box, Read conversation |
| `src/web/ui/Hud.tsx` | modify | "N waiting" chip; Command centre starts the warp |
| `src/web/scene/layout.ts` | modify | Keep the centre free for the tower |
| `src/web/scene/LaunchTower.tsx` | new | Tower island, rocket, beacon |
| `src/web/scene/WorldScene.tsx` | modify | Render the tower; expose the rise |
| `src/web/ship/ShipScene.tsx` | new | Ship `<Canvas>`: tunnel or bridge |
| `src/web/ship/WarpTunnel.tsx` | new | Instanced streak stars |
| `src/web/ship/Bridge.tsx` | new | Cockpit, console, window stars, lever, light |
| `src/web/ship/LaunchScreen.tsx` | new | Launch form |
| `src/web/ship/HistoryScreen.tsx` | new | Ship log + conversation |
| `src/web/App.tsx` | modify | Place switch; remove drawer and cards |
| `src/web/ui/CommandCentre.tsx`, `src/web/ui/RequestCards.tsx` | delete | Replaced |
| `src/web/styles.css` | modify | New component styles |
| `tests/unit/*.test.ts`, `tests/integration/*.test.ts`, `tests/e2e/*.spec.ts` | new/modify | As per task |
| `tests/fixtures/fake-claude.mjs` | new | Fake `claude` for E2E launches |
| `README.md`, `docs/design.md` | modify | Document the ship |

---

## Facts checked before planning (2026-10-08, Claude Code docs)

- `PreToolUse` hook input carries `tool_use_id`, so **questions** (AskUserQuestion) match their agent exactly.
- `PermissionRequest` hook input has **no** `tool_use_id`, and no hook input names a subagent. **Permissions** are matched by the fallback rule only (Task 7), and nothing sends an agent id.
- `--session-id`, `--name`, `--model` and `--effort` all work with `-p`; the effort values are `low|medium|high|xhigh|max|ultracode`. The spec's allow-list leaves out `ultracode` on purpose.
- Task 0 results (2026-10-08, Claude Code 2.1.292): (a) **yes**, a `claude -p` run registers in `~/.claude/sessions/` while it runs (it inherits `kind`/`entrypoint` from its environment), so launches rise as islands and Task 0b is skipped; (b) **yes**, `--session-id` is honoured with `--resume … --fork-session`, so Task 4 passes `newSessionId` for replies and logs their `sessionId`.

### Task 0: Spike — how `claude -p` runs show up (throwaway, uses a little Claude usage; ask the user first)

**Files:** none committed.

- [ ] **Step 1: Ask the user** to approve two tiny Haiku runs (a few hundred tokens), or to run the commands themselves.

- [ ] **Step 2: Fresh run with a chosen id, watching the registry**

```bash
cd "$(mktemp -d)"
ID=$(node -e "console.log(crypto.randomUUID())")
( ~/.local/bin/claude -p --session-id "$ID" --model haiku "Reply with the single word: ok" > out.txt & echo $! > pid.txt )
for i in 1 2 3 4 5 6 7 8 9 10; do grep -l "$ID" ~/.claude/sessions/*.json 2>/dev/null && break; sleep 0.5; done
wait; cat out.txt
ls ~/.claude/projects/*/"$ID".jsonl
```

Record (a): was a registry file containing `$ID` seen while the run was going (yes/no), and with which `kind` and `entrypoint`? Confirm that the transcript file exists.

- [ ] **Step 3: Fork with a chosen id**

```bash
FORK=$(node -e "console.log(crypto.randomUUID())")
~/.local/bin/claude -p --resume "$ID" --fork-session --session-id "$FORK" --model haiku "Reply with: ok again"
ls ~/.claude/projects/*/"$FORK".jsonl && echo "fork id honoured"
```

Record (b): honoured (yes/no). If the command errors, the answer is no.

- [ ] **Step 4: Write both answers into this section of the plan**, replacing "Not documented" above, and apply them:
- **(a) = yes:** nothing more to do; launched runs rise as islands on their own.
- **(a) = no:** do Task 0b before Task 1.
- **(b) = yes:** Task 4 passes `newSessionId` for replies and logs their `sessionId`.
- **(b) = no:** replies are logged with `sessionId: null` (already the default in Task 4).

### Task 0b (only if `claude -p` runs are not in the registry): show ship runs as live sessions

**Files:**
- Modify: `src/server/claude-runner.ts` (`RunHandle.pid`), `src/server/engine.ts` (`extraLive` option), `src/server/control.ts` (`runningSessions()`), `src/server/cli.ts`
- Test: `tests/unit/control-service.test.ts`, `tests/integration/resilience.test.ts` (or a new `tests/integration/extra-live.test.ts`)

**Interfaces:**
- Produces:
  - `RunHandle` gains `pid: number | undefined`.
  - `EngineOptions` gains `extraLive?: () => SessionInfo[]`.
  - `ControlService.runningSessions(): SessionInfo[]`: one entry per running log entry with a `sessionId`: `{ sessionId, pid, cwd, kind: 'print', entrypoint: 'sdk-cli', startedAt: Date.parse(entry.startedAt) }`.

- [ ] **Step 1: Failing tests.** In the unit test, a launch with a fake runner whose `start` returns `pid: 4242` makes `control.runningSessions()` equal `[{ sessionId: <id>, pid: 4242, cwd: projectDir, kind: 'print', entrypoint: 'sdk-cli', startedAt: expect.any(Number) }]`, and finishing the run empties it. In the integration test, an `Engine` with `extraLive: () => [{ sessionId: 'x1', pid: process.pid, cwd: '/work/a', kind: 'print', entrypoint: 'sdk-cli', startedAt: 1 }]` and a transcript `x1.jsonl` shows a session `x1` in `summary()` after one `tick()`.
- [ ] **Step 2: Run them; expect FAIL.**
- [ ] **Step 3: Implement.**
  - In `processRunner().start`, return `{ done, output: () => tail, pid: child.pid }`; fake runners in tests return `pid: undefined`.
  - In `Engine.tick`, replace the first line with `const registered = await listLiveSessions(this.options.claudeDir); const extra = (this.options.extraLive?.() ?? []).filter((info) => !registered.some((entry) => entry.sessionId === info.sessionId)); const live = [...registered, ...extra];`.
  - In `ControlService`, keep `private readonly pids = new Map<string, number>()`: set it in `track` when `handle.pid` is defined, and delete it in `finish`. Append:

```ts
  /**
   * Ship runs still going, as live sessions, for runs Claude Code does not register itself.
   * @returns session infos
   */
  runningSessions(): SessionInfo[] {
    return this.log.flatMap((entry) => {
      const pid = this.pids.get(entry.id);
      if (entry.state !== 'running' || !entry.sessionId || pid === undefined) return [];
      return [{ sessionId: entry.sessionId, pid, cwd: this.cwds.get(entry.id) ?? '', kind: 'print', entrypoint: 'sdk-cli', startedAt: Date.parse(entry.startedAt) }];
    });
  }
```

  with `private readonly cwds = new Map<string, string>()`, filled in `track`.
  - In `cli.ts`: `let control: ControlService | null = null; const engine = new Engine({ claudeDir, extraLive: () => control?.runningSessions() ?? [] });` then assign `control = new ControlService(...)`.
- [ ] **Step 4: Run all gates; expect PASS.**
- [ ] **Step 5: Commit** `feat(server): show ship runs as live sessions while they run`.

Do Task 0b after Task 4, since it needs `track` and the log. Its position here only records the decision.

---

### Task 1: Project catalogue

**Files:**
- Create: `src/server/projects.ts`
- Modify: `src/server/engine.ts` (append methods at the end of the class)
- Modify: `src/shared/types.ts` (append `ProjectView`)
- Test: `tests/unit/projects.test.ts`

**Interfaces:**
- Produces:
  - `projectId(cwd: string): string`: the first 16 hex characters of `sha256(cwd)`.
  - `interface KnownProject { id: string; cwd: string; name: string; branch: string; live: boolean; lastActive: number }`
  - `scanProjects(claudeDir: string, live: LiveProject[], now: number): Promise<KnownProject[]>`, where `LiveProject = { cwd: string; branch: string }`.
  - `class ProjectCatalog { constructor(options: { claudeDir: string; live: () => LiveProject[]; now?: () => number; ttlMs?: number }); list(): Promise<KnownProject[]>; find(id: string): Promise<KnownProject | undefined>; invalidate(): void }`
  - `toView(project: KnownProject): ProjectView`
  - `RECENT_MS = 30 * 24 * 3600 * 1000`
  - In types: `interface ProjectView { id: string; name: string; branch: string; live: boolean }`.
  - `Engine.liveProjects(): LiveProject[]` and `Engine.transcriptPath(sessionId: string): Promise<string | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/projects.test.ts
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
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/projects.test.ts`
Expected: FAIL with "Failed to load url ../../src/server/projects".

- [ ] **Step 3: Implement `src/server/projects.ts`**

```ts
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
```

Append to `src/shared/types.ts`:

```ts
/** A project a fresh conversation can start in, as the browser sees it (never a path). */
export interface ProjectView {
  id: string;
  name: string;
  branch: string;
  live: boolean;
}
```

Append inside the `Engine` class in `src/server/engine.ts`, after `liveSession`. Add the import `import type { LiveProject } from './projects.js';` after the last import:

```ts
  /**
   * Folders and branches of live sessions, for the project catalogue.
   * @returns live projects
   */
  liveProjects(): LiveProject[] {
    return [...this.watched.values()].map(({ session }) => ({ cwd: session.cwd, branch: session.branch }));
  }

  /**
   * Where a session's main transcript is, live or not.
   * @param sessionId - session id, already checked against `[\w-]+`
   * @returns transcript path, or null when there is none
   */
  transcriptPath(sessionId: string): Promise<string | null> {
    return findTranscript(this.options.claudeDir, sessionId);
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/projects.test.ts && npm run typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/projects.ts src/server/engine.ts src/shared/types.ts tests/unit/projects.test.ts
git commit -m "feat(server): list live and recent projects for fresh conversations"
```

---

### Task 2: Launch arguments and allow-lists

**Files:**
- Modify: `src/server/claude-args.ts`
- Modify: `tests/unit/control.test.ts`

**Interfaces:**
- Produces:
  - `MODELS = ['opus', 'sonnet', 'haiku', 'fable'] as const`, with `type ModelAlias`.
  - `EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const`, with `type EffortLevel`.
  - `interface LaunchRequest { sessionId: string; prompt: string; permissionMode: PermissionMode; model?: ModelAlias; effort?: EffortLevel }`
  - `launchArgs(request: LaunchRequest): string[]`
  - `sessionName(prompt: string): string`: the first line, at most 60 characters.
  - `RunRequest.resumeSessionId` becomes required. `runArgs` always forks, and takes an optional `newSessionId` that adds `--session-id` (see the note in Step 3).

- [ ] **Step 1: Write the failing tests.** In `tests/unit/control.test.ts`, replace the `runArgs` new-task case (the line `expect(runArgs({ prompt: 'fix the build', permissionMode: 'acceptEdits' }))…`) with:

```ts
  it('builds a fresh launch with its own session id, name, model and effort', () => {
    expect(launchArgs({ sessionId: '0b8f…', prompt: 'Add retries\nand tests', permissionMode: 'plan', model: 'sonnet', effort: 'high' })).toEqual([
      '-p', '--session-id', '0b8f…', '--name', 'Add retries', '--permission-mode', 'plan', '--model', 'sonnet', '--effort', 'high', 'Add retries\nand tests',
    ]);
    expect(launchArgs({ sessionId: 'id', prompt: 'x', permissionMode: 'default' })).toEqual(['-p', '--session-id', 'id', '--name', 'x', '--permission-mode', 'default', 'x']);
  });

  it('names a session after the first line of its prompt, shortened', () => {
    expect(sessionName(`${'a'.repeat(80)}\nmore`)).toBe(`${'a'.repeat(59)}…`);
    expect(sessionName('\n\n  Fix it  \n')).toBe('Fix it');
  });

  it('knows the allowed models and efforts', () => {
    expect(MODELS).toEqual(['opus', 'sonnet', 'haiku', 'fable']);
    expect(EFFORTS).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });
```

Update the import to `import { askArgs, EFFORTS, explanationQuestion, launchArgs, MODELS, runArgs, sessionName, validatePrompt, PROMPT_LIMIT } from '../../src/server/claude-args';`.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/control.test.ts`
Expected: FAIL: `launchArgs is not a function`.

- [ ] **Step 3: Implement.** In `src/server/claude-args.ts`, make `RunRequest.resumeSessionId: string` required and change `runArgs` to:

```ts
export function runArgs(request: RunRequest): string[] {
  const id = request.newSessionId ? ['--session-id', request.newSessionId] : [];
  return ['-p', '--resume', request.resumeSessionId, '--fork-session', ...id, '--permission-mode', request.permissionMode, request.prompt];
}
```

Add `newSessionId?: string` to `RunRequest`. **Note:** Task 0's docs check (recorded in the plan header after it runs) says whether `--session-id` is honoured together with `--fork-session`. If it is not, never pass `newSessionId`: replies are then logged with `sessionId: null`, and History shows them without a conversation.

Append at the end of the file:

```ts
/** Models a fresh conversation may use (aliases for the latest of each family). */
export const MODELS = ['opus', 'sonnet', 'haiku', 'fable'] as const;
export type ModelAlias = (typeof MODELS)[number];

/** Effort levels a fresh conversation may use. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EffortLevel = (typeof EFFORTS)[number];

/** A fresh conversation started from the ship. */
export interface LaunchRequest {
  sessionId: string;
  prompt: string;
  permissionMode: PermissionMode;
  model?: ModelAlias;
  effort?: EffortLevel;
}

/**
 * Arguments for `claude` to start a fresh conversation with a session id chosen here, so its
 * transcript is known before its first line is written.
 * @param request - session id, checked prompt and options
 * @returns argument list (no shell involved)
 */
export function launchArgs(request: LaunchRequest): string[] {
  return [
    '-p',
    '--session-id', request.sessionId,
    '--name', sessionName(request.prompt),
    '--permission-mode', request.permissionMode,
    ...(request.model ? ['--model', request.model] : []),
    ...(request.effort ? ['--effort', request.effort] : []),
    request.prompt,
  ];
}

/**
 * A session's display name: the first non-empty line of its prompt, at most 60 characters. A
 * checked prompt never starts with "-", so neither does its name.
 * @param prompt - checked prompt
 * @returns name
 */
export function sessionName(prompt: string): string {
  const line = prompt.split('\n').map((candidate) => candidate.trim()).find(Boolean) ?? '';
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}
```

Update the existing continue test in `tests/unit/control.test.ts` if its expected array changed. It must still equal `['-p', '--resume', 's-1', '--fork-session', '--permission-mode', 'default', 'now add tests']` when `newSessionId` is absent.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/control.test.ts && npm run typecheck`
Expected: control tests PASS. Typecheck FAILS in `control.ts`, where `runArgs` is called without `resumeSessionId`. Fix it by passing `resumeSessionId: session.sessionId` only when `resume` is true; Task 4 replaces this call anyway. To keep this commit green, change `launch(...)` in `control.ts` to:

```ts
    const args = resume ? runArgs({ prompt, permissionMode: mode, resumeSessionId: session.sessionId }) : ['-p', '--permission-mode', mode, prompt];
```

Re-run: `npm run typecheck && npx vitest run`. Expected: clean, all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/claude-args.ts src/server/control.ts tests/unit/control.test.ts
git commit -m "feat(server): build fresh-launch arguments with model and effort allow-lists"
```

---

### Task 3: Ship log

**Files:**
- Create: `src/server/ship-log.ts`
- Modify: `src/server/server-file.ts` (export `writePrivate`)
- Modify: `src/shared/types.ts` (append `ShipLogEntry`)
- Test: `tests/unit/ship-log.test.ts`

**Interfaces:**
- Produces:
  - In types: `interface ShipLogEntry { id: string; kind: 'launch' | 'reply'; sessionId: string | null; projectId: string | null; projectName: string; promptPreview: string; model: string; effort: string; permissionMode: string; startedAt: string; endedAt: string | null; state: 'running' | 'finished' | 'failed'; exitCode: number | null }`
  - `SHIP_LOG_FILE`, `SHIP_LOG_LIMIT = 200` and `PREVIEW_LIMIT = 280`.
  - `readShipLog(file?: string): ShipLogEntry[]`: missing or invalid gives `[]`; entries still `running` from a previous process come back as `failed` with `exitCode: null`.
  - `writeShipLog(entries: ShipLogEntry[], file?: string): void`: keeps the newest 200.
  - `previewOf(prompt: string): string`
  - `export function writePrivate(file: string, content: string): void` in `server-file.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/ship-log.test.ts
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/ship-log.test.ts`
Expected: FAIL: cannot load `ship-log`.

- [ ] **Step 3: Implement.** In `src/server/server-file.ts`, change `function writePrivate` to `export function writePrivate`.

Append to `src/shared/types.ts`:

```ts
/** One conversation started from the ship, or a reply sent from a lab panel. */
export interface ShipLogEntry {
  id: string;
  kind: 'launch' | 'reply';
  sessionId: string | null;
  projectId: string | null;
  projectName: string;
  promptPreview: string;
  model: string;
  effort: string;
  permissionMode: string;
  startedAt: string;
  endedAt: string | null;
  state: 'running' | 'finished' | 'failed';
  exitCode: number | null;
}
```

Create `src/server/ship-log.ts`:

```ts
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ShipLogEntry } from '../shared/types.js';
import { writePrivate } from './server-file.js';

/** Where the ship keeps its history; Agent World's own folder, never the Claude folder. */
export const SHIP_LOG_FILE = join(homedir(), '.agent-world', 'ship-log.json');

/** Most entries kept. */
export const SHIP_LOG_LIMIT = 200;

/** Longest prompt preview kept. */
export const PREVIEW_LIMIT = 280;

const STATES = new Set(['running', 'finished', 'failed']);

/**
 * Read the ship log. A missing file is an empty history; an unreadable one is logged and treated as
 * empty, and is replaced at the next write. Runs still marked running were cut off when an earlier
 * Agent World stopped, so they come back as failed.
 * @param file - log path (tests pass a temporary one)
 * @returns entries, newest first
 */
export function readShipLog(file = SHIP_LOG_FILE): ShipLogEntry[] {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not a list');
    return parsed.filter(isEntry).slice(0, SHIP_LOG_LIMIT).map((entry) => (entry.state === 'running' ? { ...entry, state: 'failed' as const, exitCode: null } : entry));
  } catch (error) {
    process.stderr.write(`agent-world: ignoring unreadable ship log ${file}: ${(error as Error).message}\n`);
    return [];
  }
}

/**
 * Write the ship log privately and atomically, newest entries only.
 * @param entries - entries, newest first
 * @param file - log path
 */
export function writeShipLog(entries: ShipLogEntry[], file = SHIP_LOG_FILE): void {
  writePrivate(file, JSON.stringify(entries.slice(0, SHIP_LOG_LIMIT)));
}

/**
 * A one-line preview of a prompt.
 * @param prompt - prompt text
 * @returns at most 280 characters
 */
export function previewOf(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LIMIT);
}

/**
 * Whether a parsed value is a well-formed entry.
 * @param value - parsed value
 * @returns true when every field has the right type
 */
function isEntry(value: unknown): value is ShipLogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  const text = ['id', 'projectName', 'promptPreview', 'model', 'effort', 'permissionMode', 'startedAt'].every((key) => typeof entry[key] === 'string');
  const nullableText = ['sessionId', 'projectId', 'endedAt'].every((key) => entry[key] === null || typeof entry[key] === 'string');
  return text && nullableText && (entry.kind === 'launch' || entry.kind === 'reply') && STATES.has(entry.state as string) && (entry.exitCode === null || typeof entry.exitCode === 'number');
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/ship-log.test.ts tests/unit/server-file.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ship-log.ts src/server/server-file.ts src/shared/types.ts tests/unit/ship-log.test.ts
git commit -m "feat(server): keep a private ship log of launches across restarts"
```

---

### Task 4: Launch endpoint, continue-only runs and ship-log wiring

**Files:**
- Modify: `src/server/control.ts`
- Modify: `src/server/control-routes.ts`
- Modify: `src/server/cli.ts`
- Modify: `src/shared/types.ts` (`ControlState.runs: ShipLogEntry[]`; delete `ControlRun`)
- Modify: `src/web/ui/CommandCentre.tsx` (keep it compiling until Task 13: `runs: ShipLogEntry[]`, `run.promptPreview`, `run.kind === 'reply'`; it posts `mode: 'continue'` only and its "new task" radio is removed)
- Test: `tests/unit/control-service.test.ts`, `tests/integration/control.test.ts`

**Interfaces:**
- Consumes: `ProjectCatalog`, `KnownProject`, `toView` (Task 1); `launchArgs`, `MODELS`, `EFFORTS`, `runArgs` (Task 2); `readShipLog`, `writeShipLog`, `previewOf` (Task 3).
- Produces:
  - `ControlOptions` gains `projects?: ProjectCatalog`, `logFile?: string` and `newId?: () => string`.
  - `ControlService.launch(body): Promise<ControlResult<{ launchId: string; sessionId: string }>>`
  - `ControlService.startRun(body): ControlResult<ShipLogEntry>`: continue only, with body `{sessionId, prompt, permissionMode}`.
  - `ControlService.projects(): Promise<ControlResult<ProjectView[]>>`
  - `ControlService.hasLogged(sessionId: string): boolean`
  - `ControlState.runs`: the newest 50 `ShipLogEntry` items.
  - Routes: `POST /api/launches` and `GET /api/projects`. `GET /api/projects` answers even when control is off: `{result: []}` when off.

- [ ] **Step 1: Write the failing tests.** In `tests/unit/control-service.test.ts`, replace `const run = …` with the continue-only shape, and add launch tests. Add imports `import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { readShipLog } from '../../src/server/ship-log'; import { ProjectCatalog, projectId } from '../../src/server/projects';`.

```ts
const run = (prompt: string) => ({ sessionId: 's1', prompt, permissionMode: 'default' });

/**
 * A control service with a real project folder and a private log file.
 * @param runner - fake runner
 * @returns service, project id, log file and the folder to clean up
 */
function launchable(runner: ClaudeRunner) {
  const root = mkdtempSync(join(tmpdir(), 'aw-launch-'));
  const projectDir = join(root, 'app');
  mkdirSync(projectDir);
  const logFile = join(root, 'home', 'ship-log.json');
  const projects = new ProjectCatalog({ claudeDir: join(root, 'claude'), live: () => [{ cwd: projectDir, branch: 'main' }] });
  let next = 0;
  const control = new ControlService({ enabled: true, engine, runner, projects, logFile, newId: () => `00000000-0000-4000-8000-00000000000${next++}` });
  return { control, id: projectId(projectDir), projectDir, logFile, root };
}

describe('ControlService.launch', () => {
  it('starts a fresh conversation in the project folder with its own session id', async () => {
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const runner: ClaudeRunner = { ...controllableRunner().runner, start: (args, cwd) => (calls.push({ args, cwd }), { done: new Promise(() => undefined), output: () => '' }) };
    const { control, id, projectDir, logFile, root } = launchable(runner);
    const result = await control.launch({ projectId: id, prompt: 'Add retries', permissionMode: 'plan', model: 'haiku', effort: 'low' });
    expect(result).toEqual({ ok: true, value: { launchId: '00000000-0000-4000-8000-000000000000', sessionId: '00000000-0000-4000-8000-000000000001' } });
    expect(calls[0]).toEqual({ cwd: projectDir, args: expect.arrayContaining(['--session-id', '00000000-0000-4000-8000-000000000001', '--model', 'haiku', '--effort', 'low']) });
    expect(readShipLog(logFile)[0]).toMatchObject({ kind: 'launch', projectName: 'app', promptPreview: 'Add retries', state: 'running' });
    expect(control.hasLogged('00000000-0000-4000-8000-000000000001')).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('refuses unknown projects, deleted folders, bad models and bad efforts', async () => {
    const { control, id, projectDir, root } = launchable(controllableRunner().runner);
    expect(await control.launch({ projectId: 'ffffffffffffffff', prompt: 'x', permissionMode: 'default' })).toMatchObject({ ok: false, status: 404 });
    expect(await control.launch({ projectId: id, prompt: 'x', permissionMode: 'default', model: 'gpt' })).toMatchObject({ ok: false, status: 400 });
    expect(await control.launch({ projectId: id, prompt: 'x', permissionMode: 'default', effort: 'ultra' })).toMatchObject({ ok: false, status: 400 });
    expect(await control.launch({ projectId: id, prompt: '/compact', permissionMode: 'default' })).toMatchObject({ ok: false, status: 400 });
    rmSync(projectDir, { recursive: true });
    expect(await control.launch({ projectId: id, prompt: 'x', permissionMode: 'default' })).toEqual({ ok: false, status: 404, reason: 'That project folder no longer exists.' });
    rmSync(root, { recursive: true, force: true });
  });

  it('records how a launch ended', async () => {
    const fake = controllableRunner();
    const { control, id, logFile, root } = launchable(fake.runner);
    await control.launch({ projectId: id, prompt: 'x', permissionMode: 'default' });
    fake.finishRun[0]?.(2);
    await settle();
    expect(readShipLog(logFile)[0]).toMatchObject({ state: 'failed', exitCode: 2 });
    expect(control.state().runs[0]?.endedAt).not.toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it('shares the three-run limit with replies', async () => {
    const { control, id, root } = launchable(controllableRunner().runner);
    expect(control.startRun(run('a')).ok).toBe(true);
    expect(control.startRun(run('b')).ok).toBe(true);
    expect((await control.launch({ projectId: id, prompt: 'c', permissionMode: 'default' })).ok).toBe(true);
    expect(await control.launch({ projectId: id, prompt: 'd', permissionMode: 'default' })).toMatchObject({ ok: false, status: 429 });
    rmSync(root, { recursive: true, force: true });
  });
});
```

The existing "counts running runs…" test keeps working with the new `run()` shape. In its assertion, replace `entry.prompt === 'long'` with `entry.promptPreview === 'long'`.

In `tests/integration/control.test.ts`:
- replace every `mode: 'new'` body with a `/api/launches` body or drop it, as listed below;
- create the `ControlService` with `projects: new ProjectCatalog({ claudeDir, live: () => engine.liveProjects() })` and `logFile: join(claudeDir, 'ship-log.json')`;
- point the session registry `cwd` at a real temporary folder, `appDir = mkdtempSync(join(tmpdir(), 'ctl-app-'))`.

Tests to change:

```ts
  it('lists projects by id without paths', async () => {
    const response = await call(server.port, '/api/projects');
    expect(response.status).toBe(200);
    const projects = response.body.result as Array<Record<string, unknown>>;
    expect(projects[0]).toEqual({ id: projectId(appDir), name: basename(appDir), branch: expect.any(String), live: true });
    expect(JSON.stringify(response.body)).not.toContain(appDir);
    expect((await call(off.port, '/api/projects', {}, OFF_TOKEN)).body).toEqual({ result: [] });
  });

  it('launches a fresh conversation in the chosen project folder', async () => {
    const response = await post('/api/launches', { projectId: projectId(appDir), prompt: 'Add a README', permissionMode: 'acceptEdits', cwd: '/etc' });
    expect(response.status).toBe(200);
    const start = calls.filter((entry) => entry.kind === 'start').at(-1);
    expect(start?.cwd).toBe(appDir);
    expect(start?.args).toContain('--session-id');
  });

  it('refuses a launch with an unknown project or a bad prompt', async () => {
    expect((await post('/api/launches', { projectId: 'nope', prompt: 'x', permissionMode: 'default' })).status).toBe(404);
    expect((await post('/api/launches', { projectId: projectId(appDir), prompt: '/compact', permissionMode: 'default' })).status).toBe(400);
  });
```

The old "starts a new task in the session project folder" test is deleted. The "validates the prompt, the mode and the session" and "limits how many runs go at once" tests drop `mode` from their bodies. Add `import { basename } from 'node:path'; import { ProjectCatalog, projectId } from '../../src/server/projects';`.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run tests/unit/control-service.test.ts tests/integration/control.test.ts`
Expected: FAIL: `control.launch is not a function`, and `/api/projects` returns 404.

- [ ] **Step 3: Implement in `src/server/control.ts`.**

Imports (append after the last import):

```ts
import { statSync } from 'node:fs';
import type { ProjectView, ShipLogEntry } from '../shared/types.js';
import { EFFORTS, launchArgs, MODELS } from './claude-args.js';
import type { KnownProject, ProjectCatalog } from './projects.js';
import { toView } from './projects.js';
import { previewOf, readShipLog, SHIP_LOG_FILE, writeShipLog } from './ship-log.js';
```

Remove `ControlRun` from the first type import. Add to `ControlOptions`: `projects?: ProjectCatalog; logFile?: string; newId?: () => string;`.

Replace the `runs` field and constructor body:

```ts
  private log: ShipLogEntry[];
  private readonly running = new Set<string>();
  ...
  constructor(private readonly options: ControlOptions) {
    this.now = options.now ?? Date.now;
    this.requests = new RequestStore(this.now, () => this.notify());
    this.log = options.enabled ? readShipLog(this.logFile) : [];
  }
```

Replace `state()`:

```ts
  state(): ControlState {
    return {
      enabled: this.enabled,
      requests: this.enabled ? this.requests.list(this.now()) : [],
      runs: this.log.slice(0, RUNS_IN_SUMMARY),
    };
  }
```

Replace `startRun` (continue only):

```ts
  startRun(body: Record<string, unknown>): ControlResult<ShipLogEntry> {
    const guard = this.guard();
    if (guard) return guard;
    const session = this.liveSession(body.sessionId);
    if (!session) return { ok: false, status: 404, reason: 'That session is no longer running.' };
    const check = validatePrompt(body.prompt);
    if (!check.ok) return { ok: false, status: 400, reason: check.reason };
    const mode = PERMISSION_MODES.find((candidate) => candidate === body.permissionMode);
    if (!mode) return { ok: false, status: 400, reason: 'Pick a permission mode.' };
    if (this.running.size >= MAX_RUNNING) return this.busy();
    const args = runArgs({ prompt: check.prompt, permissionMode: mode, resumeSessionId: session.sessionId });
    const entry = this.track(args, session.cwd, { kind: 'reply', sessionId: null, projectId: null, projectName: session.cwd.split(/[\\/]/).pop() || session.cwd, promptPreview: previewOf(check.prompt), model: '', effort: '', permissionMode: mode });
    return { ok: true, value: entry };
  }
```

If Task 0 confirmed that `--session-id` works with `--fork-session`, pass `newSessionId: id` in `runArgs` and `sessionId: id` in the entry, with `const id = this.newId()`.

Add the new public methods after `startRun`:

```ts
  /**
   * Start a fresh conversation from the ship in a project the server knows, by id.
   * @param body - `{projectId, prompt, permissionMode, model?, effort?}`
   * @returns the launch id and the new session id, or why it was refused
   */
  async launch(body: Record<string, unknown>): Promise<ControlResult<{ launchId: string; sessionId: string }>> {
    const guard = this.guard();
    if (guard) return guard;
    const project = typeof body.projectId === 'string' ? await this.options.projects?.find(body.projectId) : undefined;
    if (!project) return { ok: false, status: 404, reason: 'That project is not in the list; reload it.' };
    const check = validatePrompt(body.prompt);
    if (!check.ok) return { ok: false, status: 400, reason: check.reason };
    const mode = PERMISSION_MODES.find((candidate) => candidate === body.permissionMode);
    if (!mode) return { ok: false, status: 400, reason: 'Pick a permission mode.' };
    const model = body.model === undefined || body.model === '' ? undefined : MODELS.find((candidate) => candidate === body.model);
    if (body.model && !model) return { ok: false, status: 400, reason: 'Pick a model from the list.' };
    const effort = body.effort === undefined || body.effort === '' ? undefined : EFFORTS.find((candidate) => candidate === body.effort);
    if (body.effort && !effort) return { ok: false, status: 400, reason: 'Pick an effort level from the list.' };
    if (!isFolder(project.cwd)) {
      this.options.projects?.invalidate();
      return { ok: false, status: 404, reason: 'That project folder no longer exists.' };
    }
    if (this.running.size >= MAX_RUNNING) return this.busy();
    const sessionId = this.newId();
    const args = launchArgs({ sessionId, prompt: check.prompt, permissionMode: mode, ...(model ? { model } : {}), ...(effort ? { effort } : {}) });
    const entry = this.track(args, project.cwd, launchEntry(project, sessionId, check.prompt, mode, model ?? '', effort ?? ''));
    return { ok: true, value: { launchId: entry.id, sessionId } };
  }

  /**
   * Projects a fresh conversation can start in, without paths.
   * @returns the list; empty when control is off
   */
  async projects(): Promise<ControlResult<ProjectView[]>> {
    if (!this.enabled || !this.options.projects) return { ok: true, value: [] };
    return { ok: true, value: (await this.options.projects.list()).map(toView) };
  }

  /**
   * Whether the ship log has a conversation with this session id; such sessions stay readable
   * after they stop.
   * @param sessionId - session id
   * @returns true when logged
   */
  hasLogged(sessionId: string): boolean {
    return this.log.some((entry) => entry.sessionId === sessionId);
  }
```

Replace the private `launch(...)` method with `track` and its helpers:

```ts
  /**
   * Start `claude`, log the run, and update the log when it ends.
   * @param args - claude arguments
   * @param cwd - working folder from the registry or the project catalogue
   * @param fields - what to log about it
   * @returns the logged entry
   */
  private track(args: string[], cwd: string, fields: Omit<ShipLogEntry, 'id' | 'startedAt' | 'endedAt' | 'state' | 'exitCode'>): ShipLogEntry {
    const runner = this.options.runner as ClaudeRunner;
    const handle = runner.start(args, cwd, this.options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS);
    const entry: ShipLogEntry = { ...fields, id: this.newId(), startedAt: new Date(this.now()).toISOString(), endedAt: null, state: 'running', exitCode: null };
    this.running.add(entry.id);
    this.record([entry, ...this.log]);
    const finish = (code: number): void => {
      this.running.delete(entry.id);
      this.record(this.log.map((item) => (item.id === entry.id ? { ...item, state: code === 0 ? 'finished' : 'failed', exitCode: code, endedAt: new Date(this.now()).toISOString() } : item)));
    };
    handle.done.then(finish, () => finish(-1));
    return entry;
  }

  /**
   * Replace the log, save it and tell subscribers. A failed save is logged; the run goes on.
   * @param next - new log, newest first
   */
  private record(next: ShipLogEntry[]): void {
    this.log = next.slice(0, SHIP_LOG_LIMIT);
    try {
      writeShipLog(this.log, this.logFile);
    } catch (error) {
      process.stderr.write(`agent-world: could not save the ship log: ${(error as Error).message}\n`);
    }
    this.notify();
  }

  /** The refusal when the run limit is reached. */
  private busy(): ControlResult<never> {
    return { ok: false, status: 429, reason: `At most ${MAX_RUNNING} runs at a time; wait for one to finish.` };
  }

  /** A fresh id. */
  private newId(): string {
    return (this.options.newId ?? randomUUID)();
  }

  /** Where the ship log is kept. */
  private get logFile(): string {
    return this.options.logFile ?? SHIP_LOG_FILE;
  }
```

Append module-level helpers at the end of the file:

```ts
const RUNS_IN_SUMMARY = 50;

/**
 * The log fields for a fresh launch.
 * @param project - project it runs in
 * @param sessionId - its session id
 * @param prompt - checked prompt
 * @param mode - permission mode
 * @param model - model alias or empty
 * @param effort - effort level or empty
 * @returns entry fields
 */
function launchEntry(project: KnownProject, sessionId: string, prompt: string, mode: string, model: string, effort: string): Omit<ShipLogEntry, 'id' | 'startedAt' | 'endedAt' | 'state' | 'exitCode'> {
  return { kind: 'launch', sessionId, projectId: project.id, projectName: project.name, promptPreview: previewOf(prompt), model, effort, permissionMode: mode };
}

/**
 * Whether a path is an existing folder.
 * @param path - folder path from the project catalogue
 * @returns true when it is a folder
 */
function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
```

Import `SHIP_LOG_LIMIT` from `./ship-log.js`. Delete `MAX_RUNS_KEPT`.

In `src/shared/types.ts`, delete `ControlRun` and change `ControlState.runs` to `runs: ShipLogEntry[];`.

In `src/server/control-routes.ts`, add before the `routes` array:

```ts
  if (path === '/api/projects' && req.method === 'GET') {
    void control.projects().then((result) => (result.ok ? reply(res, 200, { result: result.value }) : reply(res, result.status, { error: result.reason }))).catch((error: unknown) => failed(res, reply, path, error));
    return true;
  }
```

and append to `routes`: `[/^\/api\/launches$/, 'POST', (_match, body) => control.launch(body)],`.

In `src/server/cli.ts`, append the import `import { ProjectCatalog } from './projects.js';` after the last import, and create the service with:

```ts
  const projects = new ProjectCatalog({ claudeDir, live: () => engine.liveProjects() });
  const control = new ControlService({ enabled: allowControl, engine, runner: claudeBin ? processRunner(claudeBin) : null, projects });
```

In `src/web/ui/CommandCentre.tsx`, keep the file compiling until Task 13 deletes it:
- type `runs` as `ShipLogEntry[]`;
- show `run.promptPreview`;
- show the meta as `run.kind === 'reply' ? 'Reply' : 'New conversation'`;
- remove the "Start a new task" radio and the `mode` state, and post `{ sessionId, prompt, permissionMode: permission }`;
- in `runStateLabel`, take `ShipLogEntry`.

- [ ] **Step 4: Run all gates**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all PASS (the count grows by the new tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/control.ts src/server/control-routes.ts src/server/cli.ts src/shared/types.ts src/web/ui/CommandCentre.tsx tests/unit/control-service.test.ts tests/integration/control.test.ts
git commit -m "feat(server): launch fresh conversations by project id and log every run"
```

---

### Task 5: Conversation endpoint

**Files:**
- Create: `src/shared/conversation.ts`
- Create: `src/server/conversation-file.ts`
- Modify: `src/server/http.ts`
- Modify: `src/shared/types.ts` (append `ConversationItem`)
- Test: `tests/unit/conversation.test.ts`, `tests/integration/server.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `normalizeLine` (existing), `Engine.transcriptPath` and `Engine.liveSession` (Task 1), `ControlService.hasLogged` (Task 4).
- Produces:
  - `type ConversationItem = { kind: 'prompt'; at: string; text: string } | { kind: 'reply'; at: string; text: string } | { kind: 'tool'; at: string; toolUseId: string; tool: string; summary: string; state: 'running' | 'done' | 'error' }`
  - `buildConversation(events: WorldEvent[], limit?: number): ConversationItem[]`, with the default limit `CONVERSATION_LIMIT = 2000`.
  - `readConversation(path: string): Promise<ConversationItem[]>`: reads at most the last 16 MB.
  - `GET /api/conversations/:sessionId` → `{ items: ConversationItem[], live: boolean }`, or 404.

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/conversation.test.ts
import { describe, expect, it } from 'vitest';
import { buildConversation } from '../../src/shared/conversation';
import type { WorldEvent } from '../../src/shared/types';

const AT = '2026-10-08T10:00:00.000Z';

describe('buildConversation', () => {
  it('turns events into prompts, replies and tool calls in order', () => {
    const events: WorldEvent[] = [
      { kind: 'prompt', at: AT, text: 'Add retries', promptId: 'p1' },
      { kind: 'thinking', at: AT },
      { kind: 'tool', at: AT, toolUseId: 't1', tool: 'Edit', summary: 'client.ts' },
      { kind: 'toolResult', at: AT, toolUseId: 't1', isError: false },
      { kind: 'tool', at: AT, toolUseId: 't2', tool: 'Bash', summary: 'npm test' },
      { kind: 'toolResult', at: AT, toolUseId: 't2', isError: true },
      { kind: 'tool', at: AT, toolUseId: 't3', tool: 'Read', summary: 'a.ts' },
      { kind: 'text', at: AT, text: 'Done: retries added.', final: true },
      { kind: 'meta', at: AT, model: 'x' },
    ];
    expect(buildConversation(events)).toEqual([
      { kind: 'prompt', at: AT, text: 'Add retries' },
      { kind: 'tool', at: AT, toolUseId: 't1', tool: 'Edit', summary: 'client.ts', state: 'done' },
      { kind: 'tool', at: AT, toolUseId: 't2', tool: 'Bash', summary: 'npm test', state: 'error' },
      { kind: 'tool', at: AT, toolUseId: 't3', tool: 'Read', summary: 'a.ts', state: 'running' },
      { kind: 'reply', at: AT, text: 'Done: retries added.' },
    ]);
  });

  it('skips empty text and keeps only the newest items', () => {
    const events: WorldEvent[] = Array.from({ length: 10 }, (_, index) => ({ kind: 'text', at: AT, text: index === 0 ? '  ' : `m${index}`, final: false }));
    expect(buildConversation(events, 3).map((item) => ('text' in item ? item.text : ''))).toEqual(['m7', 'm8', 'm9']);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/conversation.test.ts`
Expected: FAIL: cannot load `conversation`.

- [ ] **Step 3: Implement.** Append to `src/shared/types.ts`:

```ts
/** One item in a conversation shown as chat. */
export type ConversationItem =
  | { kind: 'prompt'; at: string; text: string }
  | { kind: 'reply'; at: string; text: string }
  | { kind: 'tool'; at: string; toolUseId: string; tool: string; summary: string; state: 'running' | 'done' | 'error' };
```

Create `src/shared/conversation.ts`:

```ts
import type { ConversationItem, WorldEvent } from './types.js';

/** Most items a conversation view holds. */
export const CONVERSATION_LIMIT = 2000;

/**
 * A main transcript's events as chat: your prompts, the agent's messages, and its tool calls with
 * their outcome. Thinking, interruptions and metadata are left out.
 * @param events - normalized events of the main transcript, in order
 * @param limit - most items kept, newest last
 * @returns chat items
 */
export function buildConversation(events: WorldEvent[], limit = CONVERSATION_LIMIT): ConversationItem[] {
  const items: ConversationItem[] = [];
  const tools = new Map<string, number>();
  for (const event of events) {
    if (event.kind === 'prompt') items.push({ kind: 'prompt', at: event.at, text: event.text });
    if (event.kind === 'text' && event.text.trim()) items.push({ kind: 'reply', at: event.at, text: event.text });
    if (event.kind === 'tool') {
      tools.set(event.toolUseId, items.length);
      items.push({ kind: 'tool', at: event.at, toolUseId: event.toolUseId, tool: event.tool, summary: event.summary, state: 'running' });
    }
    if (event.kind === 'toolResult') {
      const index = tools.get(event.toolUseId);
      const item = index === undefined ? undefined : items[index];
      if (item?.kind === 'tool') items[index as number] = { ...item, state: event.isError ? 'error' : 'done' };
    }
  }
  return items.slice(-limit);
}
```

Create `src/server/conversation-file.ts`:

```ts
import { open } from 'node:fs/promises';
import { buildConversation } from '../shared/conversation.js';
import type { ConversationItem } from '../shared/types.js';
import { normalizeLine } from './normalize.js';

const TAIL_BYTES = 16 * 1024 * 1024;

/**
 * Read a transcript's last 16 MB and build its conversation. A cut first line is dropped.
 * @param path - transcript path
 * @returns chat items
 */
export async function readConversation(path: string): Promise<ConversationItem[]> {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const start = Math.max(0, size - TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    await file.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n');
    if (start > 0) lines.shift();
    return buildConversation(lines.flatMap((raw) => {
      try {
        return normalizeLine(JSON.parse(raw));
      } catch {
        return [];
      }
    }));
  } finally {
    await file.close();
  }
}
```

In `src/server/http.ts`, append the import `import { readConversation } from './conversation-file.js';` after the last import. In `handleRequest`, before `if (path.startsWith('/api/')) return labDetail(...)`, add:

```ts
  const conversation = /^\/api\/conversations\/([\w-]{1,100})$/.exec(path);
  if (conversation) return void conversationOf(res, options, conversation[1] ?? '');
```

Append at the end of the file:

```ts
/**
 * `GET /api/conversations/:sessionId`: a live session, or one the ship launched.
 * @param res - response
 * @param options - server settings
 * @param sessionId - session id, already matched against `[\w-]+`
 */
async function conversationOf(res: ServerResponse, options: ServerOptions, sessionId: string): Promise<void> {
  const live = options.engine.liveSession(sessionId) !== undefined;
  if (!live && !options.control?.hasLogged(sessionId)) return reply(res, 404, { error: 'not found' });
  try {
    const path = await options.engine.transcriptPath(sessionId);
    if (!path) return reply(res, 404, { error: 'This conversation\'s transcript is gone.' });
    return reply(res, 200, { items: await readConversation(path), live });
  } catch (error) {
    process.stderr.write(`agent-world: conversation ${sessionId} failed: ${(error as Error).message}\n`);
    if (!res.headersSent) reply(res, 500, { error: 'internal error' });
  }
}
```

- [ ] **Step 4: Add the integration test.** Append to `tests/integration/server.test.ts`, using its existing `call` helper, server and fixture session id. If the helper is named differently there, use that file's own helper. Assume `SESSION_ID` is its live session.

```ts
describe('GET /api/conversations/:sessionId', () => {
  it('returns a live session as chat', async () => {
    const response = await call(`/api/conversations/${SESSION_ID}`);
    expect(response.status).toBe(200);
    expect(response.body.live).toBe(true);
    expect((response.body.items as Array<{ kind: string }>)[0]?.kind).toBe('prompt');
  });

  it('refuses sessions that are neither live nor launched by the ship', async () => {
    expect((await call('/api/conversations/not-a-session')).status).toBe(404);
    expect((await call('/api/conversations/..%2F..%2Fetc')).status).toBe(404);
    expect((await call(`/api/conversations/${SESSION_ID}`, '')).status).toBe(401);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/conversation.ts src/server/conversation-file.ts src/server/http.ts src/shared/types.ts tests/unit/conversation.test.ts tests/integration/server.test.ts
git commit -m "feat(server): serve a session's conversation as chat for the ship"
```

---

### Task 6: Questions carry the agent's tool call id

**Files:**
- Modify: `src/server/hook.ts`, `src/server/control.ts` (`raise`), `src/server/requests.ts` (`create` input type), `src/shared/types.ts` (`PendingRequest`)
- Test: `tests/unit/control-service.test.ts`, `tests/integration/control.test.ts` (hook run)

**Interfaces:**
- Produces: `PendingRequest` (both variants) gains `toolUseId?: string`. The hook sends `toolUseId: input.tool_use_id` when it is a string; only `PreToolUse` (questions) carries it, never `PermissionRequest`. `raise` accepts it only if it matches `/^[\w-]{1,100}$/`.

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/control-service.test.ts`:

```ts
describe('ControlService.raise', () => {
  it('keeps the tool call id the hook sends, when it looks like an id', () => {
    const control = new ControlService({ enabled: true, engine, runner: null });
    control.raise({ event: 'permission', sessionId: 's1', toolName: 'Bash', toolInput: { command: 'ls' }, toolUseId: 'toolu_01' });
    control.raise({ event: 'permission', sessionId: 's1', toolName: 'Bash', toolInput: { command: 'ls' }, toolUseId: '../x y' });
    const [second, first] = control.state().requests;
    expect(first).toMatchObject({ toolUseId: 'toolu_01' });
    expect(second?.toolUseId).toBeUndefined();
  });
});
```

Check the order `requests.list` returns. If it is oldest-first, swap the destructured names.

In `tests/integration/control.test.ts`, find the hook run that sends `AskUserQuestion` input. Add `tool_use_id: 'toolu_hook'` to its input, and after `firstRequestId()` assert that `world.control.requests[0].toolUseId === 'toolu_hook'`.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run tests/unit/control-service.test.ts tests/integration/control.test.ts`
Expected: FAIL, because `toolUseId` is undefined.

- [ ] **Step 3: Implement.**
- In `hook.ts`, add `tool_use_id?: unknown;` to `HookInput`, and extend the POST body with `...(typeof input.tool_use_id === 'string' ? { toolUseId: input.tool_use_id } : {})`.
- In `types.ts`, add `toolUseId?: string;` to both `PendingRequest` variants.
- In `control.ts`, inside `raise`, compute `const ids = typeof body.toolUseId === 'string' && ID.test(body.toolUseId) ? { toolUseId: body.toolUseId } : {};` and spread `...ids` into both `this.requests.create({...})` calls.
- In `requests.ts`, the `create` parameter type is derived from `PendingRequest`, so it accepts the new optional field. If it lists fields explicitly, add it there.

- [ ] **Step 4: Run all gates**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/hook.ts src/server/control.ts src/server/requests.ts src/shared/types.ts tests/unit/control-service.test.ts tests/integration/control.test.ts
git commit -m "feat(hook): send the tool call id with agent questions"
```

---

### Task 7: Match requests to agents

**Files:**
- Create: `src/web/state/requests.ts`
- Test: `tests/unit/request-match.test.ts`

**Interfaces:**
- Consumes: `PendingRequest` (Task 6) and `SessionSummary` (existing).
- Produces:
  - `interface RequestPlace { request: PendingRequest; sessionId: string; labId: string | null; scientistId: string | null }`
  - `placeRequests(requests: PendingRequest[], sessions: SessionSummary[]): RequestPlace[]`, in the same order as `requests`.
  - `requestsFor(places: RequestPlace[], sessionId: string, labId: string, scientistId: string | null): PendingRequest[]`: with `scientistId: null`, it returns the lab-level ones (those with `scientistId === null`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/request-match.test.ts
import { describe, expect, it } from 'vitest';
import { placeRequests, requestsFor } from '../../src/web/state/requests';
import type { PendingRequest, ScientistSummary, SessionSummary } from '../../src/shared/types';

const scientist = (id: string, status: ScientistSummary['status'], tool?: string, toolUseId?: string): ScientistSummary =>
  ({ id, role: id, description: '', status, current: tool ? { tool, summary: '', since: '2026-10-08T10:00:00Z', toolUseId: toolUseId ?? `t-${id}` } : null, parentId: null, depth: 0, model: '', effort: '', changeCount: 0, updatedAt: '' }) as ScientistSummary;

const session = (scientists: ScientistSummary[]): SessionSummary =>
  ({ sessionId: 's1', labs: [{ id: 'old', scientists: [] }, { id: 'lab-2', scientists }] }) as unknown as SessionSummary;

const question = (extra: Partial<PendingRequest> = {}): PendingRequest =>
  ({ id: 'q1', kind: 'question', sessionId: 's1', createdAt: '', expiresAt: '', questions: [], ...extra }) as PendingRequest;

const permission = (tool: string, extra: Partial<PendingRequest> = {}): PendingRequest =>
  ({ id: `p-${tool}`, kind: 'permission', sessionId: 's1', createdAt: '', expiresAt: '', tool, summary: '', detail: '', truncated: false, ...extra }) as PendingRequest;

describe('placeRequests', () => {
  it('uses the tool call id when the hook sent one', () => {
    const places = placeRequests([permission('Bash', { toolUseId: 't-b' })], [session([scientist('a', 'working', 'Bash', 't-a'), scientist('b', 'working', 'Bash', 't-b')])]);
    expect(places[0]).toMatchObject({ labId: 'lab-2', scientistId: 'b' });
  });

  it('falls back to the only asking agent for a question', () => {
    expect(placeRequests([question()], [session([scientist('main', 'working', 'Bash'), scientist('ex', 'asking', 'AskUserQuestion')])])[0]).toMatchObject({ scientistId: 'ex' });
  });

  it('falls back to the only agent working on that tool for a permission', () => {
    expect(placeRequests([permission('Write')], [session([scientist('main', 'working', 'Write'), scientist('ex', 'working', 'Read')])])[0]).toMatchObject({ scientistId: 'main' });
  });

  it('never guesses between two candidates: the request goes to the newest lab', () => {
    const places = placeRequests([permission('Bash')], [session([scientist('a', 'working', 'Bash'), scientist('b', 'working', 'Bash')])]);
    expect(places[0]).toMatchObject({ labId: 'lab-2', scientistId: null });
  });

  it('keeps a request whose session is not in the world, with no lab', () => {
    expect(placeRequests([question({ sessionId: 'gone' })], [])[0]).toMatchObject({ sessionId: 'gone', labId: null, scientistId: null });
  });
});

describe('requestsFor', () => {
  it('picks an agent\'s requests, or the lab-level ones', () => {
    const places = placeRequests([permission('Bash', { toolUseId: 't-a' }), permission('Edit')], [session([scientist('a', 'working', 'Bash', 't-a'), scientist('b', 'working', 'Bash'), scientist('c', 'working', 'Bash')])]);
    expect(requestsFor(places, 's1', 'lab-2', 'a').map((request) => request.id)).toEqual(['p-Bash']);
    expect(requestsFor(places, 's1', 'lab-2', null).map((request) => request.id)).toEqual(['p-Edit']);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/request-match.test.ts`
Expected: FAIL: cannot load the module.

- [ ] **Step 3: Implement `src/web/state/requests.ts`**

```ts
import type { PendingRequest, ScientistSummary, SessionSummary } from '../../shared/types';

/** Where a request is answered: on one agent, or on its session's newest lab. */
export interface RequestPlace {
  request: PendingRequest;
  sessionId: string;
  labId: string | null;
  scientistId: string | null;
}

/**
 * Place each request on the agent waiting for it: by the tool call id when the hook sent one, else
 * the only agent that can be waiting for it. When that is ambiguous, nothing is guessed: the request
 * is answered on the session's newest lab instead.
 * @param requests - open requests
 * @param sessions - live sessions
 * @returns one place per request, in the same order
 */
export function placeRequests(requests: PendingRequest[], sessions: SessionSummary[]): RequestPlace[] {
  return requests.map((request) => {
    const session = sessions.find((candidate) => candidate.sessionId === request.sessionId);
    const newest = session?.labs.at(-1) ?? null;
    if (!session || !newest) return { request, sessionId: request.sessionId, labId: null, scientistId: null };
    const all = session.labs.flatMap((lab) => lab.scientists.map((scientist) => ({ lab, scientist })));
    const byId = request.toolUseId ? all.find(({ scientist }) => scientist.current?.toolUseId === request.toolUseId) : undefined;
    const candidates = byId ? [byId] : all.filter(({ scientist }) => canBeWaiting(scientist, request));
    const only = candidates.length === 1 ? candidates[0] : undefined;
    return only ? { request, sessionId: session.sessionId, labId: only.lab.id, scientistId: only.scientist.id } : { request, sessionId: session.sessionId, labId: newest.id, scientistId: null };
  });
}

/**
 * The requests answered on one agent, or on a lab itself when `scientistId` is null.
 * @param places - placed requests
 * @param sessionId - session id
 * @param labId - lab id
 * @param scientistId - agent id, or null for lab-level requests
 * @returns requests
 */
export function requestsFor(places: RequestPlace[], sessionId: string, labId: string, scientistId: string | null): PendingRequest[] {
  return places.filter((place) => place.sessionId === sessionId && place.labId === labId && place.scientistId === scientistId).map((place) => place.request);
}

/**
 * Whether an agent can be the one waiting on a request.
 * @param scientist - agent
 * @param request - request
 * @returns true for an asking agent (questions) or one running that tool (permissions)
 */
function canBeWaiting(scientist: ScientistSummary, request: PendingRequest): boolean {
  if (request.kind === 'question') return scientist.status === 'asking';
  return scientist.status === 'working' && scientist.current?.tool === request.tool;
}
```

Note: the fixture's `labs[1]` is the newest lab; the repo keeps labs in order, oldest first. Check that in `src/server/world.ts` and use `.at(0)` instead if labs are kept newest first.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/request-match.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/state/requests.ts tests/unit/request-match.test.ts
git commit -m "feat(web): place each agent request on the agent waiting for it"
```

---

### Task 8: Answer in place, reply box, waiting chip

**Files:**
- Create: `src/web/ui/RequestForm.tsx` (move `RequestCard`, `QuestionBlock` and `answerFor` out of `RequestCards.tsx`)
- Create: `src/web/ui/ReplyBox.tsx`
- Modify: `src/web/ui/InspectPanel.tsx`, `src/web/ui/Hud.tsx`, `src/web/App.tsx`, `src/web/styles.css`
- Modify: `tests/unit/request-cards.test.ts` → rename to `tests/unit/request-form.test.ts`, with its import changed to `../../src/web/ui/RequestForm`
- Test: `tests/unit/overlay.test.ts` (append)

**Interfaces:**
- Consumes: `placeRequests`, `requestsFor` and `RequestPlace` (Task 7); `sendControl` (existing).
- Produces:
  - `RequestForm({ access, request, sessionName, now }): ReactElement`: the old `RequestCard` with class `request-form`.
  - `answerFor`, exported from `RequestForm.tsx`.
  - `ReplyBox({ access, sessionId }): ReactElement`
  - `InspectPanel` gains the props `places: RequestPlace[]` and `onReadConversation: (sessionId: string) => void`.
  - `Hud` gains `waiting: RequestPlace[]` and `onShowWaiting: () => void`, and drops `waitingOnYou`.
  - In `App.tsx`: `showOldestWaiting()` selects the lab of `places[0]` and opens the agent view when `scientistId` is set, else the lab view.

- [ ] **Step 1: Write the failing tests.** Append to `tests/unit/overlay.test.ts`:

```ts
import { placeRequests } from '../../src/web/state/requests';
import type { PendingRequest } from '../../src/shared/types';

const askReq = { id: 'q1', kind: 'question', sessionId: 's1', createdAt: '', expiresAt: '2026-10-08T10:03:00Z', questions: [{ question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Blue', description: '' }] }] } as PendingRequest;

describe('answering in place', () => {
  const panelWith = (view: Parameters<typeof InspectPanel>[0]['view'], scientists: ScientistSummary[]): string => {
    const labs = [lab({ scientists })];
    const places = placeRequests([askReq], [session(labs)]);
    return renderToStaticMarkup(createElement(InspectPanel, { session: session(labs), lab: labs[0]!, detail: null, view, now: NOW, replayBar: null, access: { enabled: true }, places, onView: () => undefined, onClose: () => undefined, onReadConversation: () => undefined }));
  };

  it('shows the question at the top of the asking agent\'s panel', () => {
    const markup = panelWith({ kind: 'scientist', scientistId: 'main' }, [scientist({ status: 'asking', current: { tool: 'AskUserQuestion', summary: '', since: '2026-10-08T10:01:00Z', toolUseId: 't9' } })]);
    expect(markup).toContain('Which colour?');
    expect(markup).toContain('Send answer');
  });

  it('shows an unplaced request in the lab\'s Waiting on you section', () => {
    const markup = panelWith({ kind: 'lab' }, [scientist(), scientist({ id: 'b' })]);
    expect(markup).toContain('Waiting on you');
    expect(markup).toContain('Which colour?');
  });

  it('offers a reply box and a conversation link in the lab view when control is on', () => {
    const markup = panelWith({ kind: 'lab' }, [scientist()]);
    expect(markup).toContain('Reply to this session');
    expect(markup).toContain('Read conversation');
  });

  it('shows a waiting chip in the top bar that names the count', () => {
    const labs = [lab()];
    const markup = renderToStaticMarkup(createElement(Hud, { world: world(labs), connected: true, now: NOW, focusedSessionId: null, onFocusContinent: () => undefined, onOverview: () => undefined, onCommand: () => undefined, waiting: placeRequests([askReq], [session(labs)]), onShowWaiting: () => undefined }));
    expect(markup).toMatch(/<button[^>]*class="hud__chip hud__chip--asking"[^>]*>.*1 waiting/);
  });
});
```

Update the existing `hud()` helper and `panel()` helper in the same file to pass `waiting: []`, `onShowWaiting`, `places: []` and `onReadConversation`.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run tests/unit/overlay.test.ts`
Expected: FAIL; "Which colour?" and "Reply to this session" are not found.

- [ ] **Step 3: Implement.**

`src/web/ui/RequestForm.tsx`: move the whole `RequestCard`, `QuestionBlock` and `answerFor` from `RequestCards.tsx` unchanged, then:
- rename `RequestCard` to the exported `RequestForm`;
- change `className="request"` / `"request request--permission"` to `"request-form"` / `"request-form request-form--permission"`;
- keep every button label ("Allow", "Deny", "Send answer") and every `aria-label`.

Delete `RequestCards.tsx` in Task 13, not here; for now it imports `RequestForm` to render each card, so the old top cards keep working until then.

`src/web/ui/ReplyBox.tsx`:

```tsx
import { useState, type FormEvent, type ReactElement } from 'react';
import { sendControl, type ControlAccess } from '../state/control';
import { Icon } from './icons';

/** Permission modes a reply may run in, as a person would say them. */
const MODES = { default: 'Ask before risky actions', acceptEdits: 'Accept file edits', plan: 'Plan only' } as const;

/**
 * "Reply to this session": sends a follow-up that runs on a copy of the session, so the session open
 * in your editor or terminal is never written into. The copy appears as its own island.
 * @param props - access and the session to reply to
 * @returns the reply box
 */
export function ReplyBox({ access, sessionId }: { access: ControlAccess; sessionId: string }): ReactElement {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<keyof typeof MODES>('default');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' } | { kind: 'done' | 'error'; text: string }>({ kind: 'idle' });

  const send = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    setState({ kind: 'sending' });
    const reply = await sendControl<unknown>(access, '/api/runs', { sessionId, prompt, permissionMode: mode });
    if (!reply.ok) return setState({ kind: 'error', text: reply.error });
    setPrompt('');
    setState({ kind: 'done', text: 'Sent. A copy of this session is working on it and will rise as its own island.' });
  };

  return (
    <form className="reply" onSubmit={(event) => void send(event)}>
      <label className="field">
        <span className="field__label">Reply to this session</span>
        <textarea
          className="field__input"
          rows={3}
          value={prompt}
          placeholder="Runs on a copy; your open session is not changed"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void send();
          }}
        />
      </label>
      <div className="reply__actions">
        <select className="field__input reply__mode" aria-label="Permissions" value={mode} onChange={(event) => setMode(event.target.value as keyof typeof MODES)}>
          {(Object.keys(MODES) as Array<keyof typeof MODES>).map((key) => (
            <option key={key} value={key}>
              {MODES[key]}
            </option>
          ))}
        </select>
        <button type="submit" className="button button--primary" disabled={state.kind === 'sending' || !prompt.trim()}>
          <Icon name="command" />
          {state.kind === 'sending' ? 'Sending…' : 'Send reply'}
        </button>
      </div>
      {(state.kind === 'done' || state.kind === 'error') && (
        <p className={`notice-inline notice-inline--${state.kind}`} role="status">
          {state.text}
        </p>
      )}
    </form>
  );
}
```

In `InspectPanel.tsx`:
- add the props `places: RequestPlace[]` and `onReadConversation: (sessionId: string) => void` to `InspectPanelProps`;
- append the imports for `RequestForm`, `ReplyBox`, `requestsFor` and `RequestPlace` after the last import.

In `LabView`, insert this first in the fragment, before `<h2 className="panel__title">`:

```tsx
      {waitingHere.length > 0 && (
        <section className="section section--waiting">
          <h3 className="section__title">Waiting on you</h3>
          {waitingHere.map((request) => (
            <RequestForm key={request.id} access={access} request={request} sessionName={session.title || session.project} now={now} />
          ))}
        </section>
      )}
```

with `const waitingHere = requestsFor(places, session.sessionId, lab.id, null);` at the top of `LabView`, where `places` comes from props.

After the Changes section, add:

```tsx
      <section className="section">
        <h3 className="section__title">Conversation</h3>
        <button type="button" className="row row--link" onClick={() => onReadConversation(session.sessionId)}>
          <span className="row__main">Read conversation</span>
          <span className="row__sub">Every prompt and reply in this session, as chat</span>
          <Icon name="chevron" className="row__chevron" />
        </button>
      </section>
      {access.enabled && (
        <section className="section">
          <ReplyBox access={access} sessionId={session.sessionId} />
        </section>
      )}
```

In `ScientistView`, right after the `<h2 className="panel__title">`, add:

```tsx
      {requestsFor(places, session.sessionId, lab.id, scientistId).map((request) => (
        <RequestForm key={request.id} access={access} request={request} sessionName={session.title || session.project} now={now} />
      ))}
```

In `Hud.tsx`:
- replace `waitingOnYou: number` with `waiting: RequestPlace[]` and `onShowWaiting: () => void`;
- remove the `hud__badge` from the Command button;
- inside `hud__alerts`, replace the non-interactive "asking you" span with:

```tsx
            {waiting.length > 0 && (
              <button type="button" className="hud__chip hud__chip--asking" onClick={onShowWaiting}>
                <span className="status-dot status-dot--asking" aria-hidden="true" />
                {waiting.length} waiting
              </button>
            )}
```

Show `hud__alerts` when `waiting.length > 0 || stats.waiting > 0`. Remove `stats.asking` from the HUD; `worldStats` keeps computing it.

In `App.tsx`:
- compute `const places = useMemo(() => placeRequests(world?.control?.requests ?? [], world?.sessions ?? []), [world]);`;
- pass `places` and `onReadConversation={(sessionId) => setReading(sessionId)}` to `InspectPanel`, with a new state `const [reading, setReading] = useState<string | null>(null);`; Task 12 renders the reader;
- pass `waiting={places}` and `onShowWaiting={showOldestWaiting}` to `Hud`;
- append the callback after the existing callbacks, above the `return (`:

```tsx
  const showOldestWaiting = useCallback(() => {
    const first = places.find((place) => place.labId);
    if (!first?.labId) return;
    selectLab(first.sessionId, first.labId, first.scientistId ? { kind: 'scientist', scientistId: first.scientistId } : { kind: 'lab' });
  }, [places, selectLab]);
```

Append to `styles.css`:

```css
.request-form {
  margin: 0.75rem 0;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--border-strong);
  border-left: 3px solid var(--asking);
  border-radius: var(--radius-control);
}

.request-form--permission {
  border-left-color: var(--accent);
}

.section--waiting .section__title {
  color: var(--asking);
}

.reply {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.reply__actions {
  display: flex;
  gap: 0.5rem;
}

.reply__mode {
  flex: 1;
}

.hud__chip--asking {
  background: none;
  color: var(--text);
  cursor: pointer;
}
```

Leave the element selectors `.request__who`, `.request__what`, `.request__detail`, `.request__actions` and `.request__clock` as they are: `RequestForm` keeps using those class names. Only the outer card class changes, from `.request` to `.request-form`.

- [ ] **Step 4: Run all gates, E2E included**

Run: `npx vitest run && npm run typecheck && npm run build && PW_CHROMIUM_PATH=$(ls ~/.cache/ms-playwright/chromium-1234/*/chrome | head -1) npm run test:e2e`
Expected: unit PASS; E2E 8/8 (no E2E selector changed).

- [ ] **Step 5: Commit**

```bash
git add src/web/ui/RequestForm.tsx src/web/ui/ReplyBox.tsx src/web/ui/RequestCards.tsx src/web/ui/InspectPanel.tsx src/web/ui/Hud.tsx src/web/App.tsx src/web/styles.css tests/unit/overlay.test.ts tests/unit/request-form.test.ts
git rm tests/unit/request-cards.test.ts
git commit -m "feat(web): answer agents, reply and read conversations from the lab panel"
```

---

### Task 9: Keep the centre free for the launch tower

**Files:**
- Modify: `src/web/scene/layout.ts`
- Test: `tests/unit/layout.test.ts`

**Interfaces:**
- Produces: `TOWER_RADIUS = 7`. `continentPlacements(labCounts, spacings)` keeps every continent clear of a circle of `TOWER_RADIUS` at the origin, and its signature is unchanged.

- [ ] **Step 1: Write the failing test.** Replace the first `continentPlacements` test's origin assertion:

```ts
  it('keeps the centre free for the launch tower and keeps continents from overlapping', () => {
    const placements = continentPlacements([3, 40, 1, 8]);
    for (const placement of placements) {
      expect(Math.hypot(placement.x, placement.z)).toBeGreaterThan(placement.radius + TOWER_RADIUS);
    }
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const left = placements[i];
        const right = placements[j];
        if (!left || !right) throw new Error('missing placement');
        expect(Math.hypot(left.x - right.x, left.z - right.z)).toBeGreaterThan(left.radius + right.radius);
      }
    }
  });
```

Add `TOWER_RADIUS` to the import from `layout`.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/layout.test.ts`
Expected: FAIL: `TOWER_RADIUS` is undefined.

- [ ] **Step 3: Implement.** Replace the body of `continentPlacements`:

```ts
export function continentPlacements(labCounts: number[], spacings: number[] = []): Placement[] {
  const tower: Placement = { x: 0, z: 0, radius: TOWER_RADIUS };
  const placed: Placement[] = [tower];
  labCounts.forEach((count, index) => {
    const radius = islandRadius(count, spacings[index] ?? LAB_SPACING);
    const angle = index * GOLDEN_ANGLE;
    for (let distance = radius + TOWER_RADIUS; ; distance += 2) {
      const candidate = { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance, radius };
      const clear = placed.every((other) => Math.hypot(other.x - candidate.x, other.z - candidate.z) > (other.radius + radius) * SHORE_REACH + CONTINENT_GAP);
      if (clear) {
        placed.push(candidate);
        return;
      }
    }
  });
  return placed.slice(1);
}
```

Update its JSDoc to: "Continent centres around the launch-tower island at the origin, each at the nearest free spot along a golden-angle spiral, so nothing overlaps whatever its size." Append at the end of the file:

```ts
/** Radius of the launch-tower island at the centre of the world. */
export const TOWER_RADIUS = 7;
```

- [ ] **Step 4: Run all gates, E2E included** (camera framing changes)

Run: `npx vitest run && npm run typecheck && npm run build && PW_CHROMIUM_PATH=$(ls ~/.cache/ms-playwright/chromium-1234/*/chrome | head -1) npm run test:e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/scene/layout.ts tests/unit/layout.test.ts
git commit -m "feat(world): keep the centre of the ocean free for the launch tower"
```

---

### Task 10: Place state machine

**Files:**
- Create: `src/web/state/place.ts`
- Test: `tests/unit/place.test.ts`

**Interfaces:**
- Produces:
  - `type WorldTarget = { sessionId: string; labId: string; scientistId: string | null }`
  - `type Place = { kind: 'world' } | { kind: 'warping-in'; startedAt: number } | { kind: 'ship' } | { kind: 'warping-out'; startedAt: number; target: WorldTarget | null }`
  - `type PlaceAction = { type: 'enter'; at: number } | { type: 'leave'; at: number; target?: WorldTarget | null } | { type: 'tick'; at: number; reducedMotion: boolean }`
  - `WARP = { rise: 600, tunnel: 1600, fade: 300 }` and `REDUCED_WARP_MS = 300`.
  - `warpDuration(reducedMotion: boolean): number`
  - `placeReducer(place: Place, action: PlaceAction): Place`
  - `warpPhase(place: Place, at: number, reducedMotion: boolean): { phase: 'rise' | 'tunnel' | 'fade'; progress: number } | null`, where `progress` runs from 0 to 1 within the phase. During warping-out the phases run fade → tunnel → rise.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/place.test.ts
import { describe, expect, it } from 'vitest';
import { placeReducer, REDUCED_WARP_MS, warpDuration, warpPhase, type Place } from '../../src/web/state/place';

const world: Place = { kind: 'world' };

describe('placeReducer', () => {
  it('warps in, lands on the ship, warps out and lands in the world with a target', () => {
    let place = placeReducer(world, { type: 'enter', at: 0 });
    expect(place).toEqual({ kind: 'warping-in', startedAt: 0 });
    place = placeReducer(place, { type: 'tick', at: warpDuration(false) - 1, reducedMotion: false });
    expect(place.kind).toBe('warping-in');
    place = placeReducer(place, { type: 'tick', at: warpDuration(false), reducedMotion: false });
    expect(place).toEqual({ kind: 'ship' });
    const target = { sessionId: 's1', labId: 'l1', scientistId: null };
    place = placeReducer(place, { type: 'leave', at: 10_000, target });
    expect(place).toEqual({ kind: 'warping-out', startedAt: 10_000, target });
    expect(placeReducer(place, { type: 'tick', at: 10_000 + warpDuration(false), reducedMotion: false })).toEqual({ kind: 'world' });
  });

  it('ignores entering while not in the world and leaving while not on the ship', () => {
    const warping: Place = { kind: 'warping-in', startedAt: 0 };
    expect(placeReducer(warping, { type: 'enter', at: 5 })).toBe(warping);
    expect(placeReducer(world, { type: 'leave', at: 5 })).toBe(world);
  });

  it('takes a short cross-fade with reduced motion', () => {
    expect(warpDuration(true)).toBe(REDUCED_WARP_MS);
    expect(placeReducer({ kind: 'warping-in', startedAt: 0 }, { type: 'tick', at: REDUCED_WARP_MS, reducedMotion: true })).toEqual({ kind: 'ship' });
  });
});

describe('warpPhase', () => {
  it('rises, then tunnels, then fades on the way in', () => {
    const place: Place = { kind: 'warping-in', startedAt: 0 };
    expect(warpPhase(place, 300, false)).toEqual({ phase: 'rise', progress: 0.5 });
    expect(warpPhase(place, 1400, false)).toEqual({ phase: 'tunnel', progress: 0.5 });
    expect(warpPhase(place, 2350, false)).toEqual({ phase: 'fade', progress: 0.5 });
  });

  it('runs backwards on the way out and is only a fade with reduced motion', () => {
    const place: Place = { kind: 'warping-out', startedAt: 0, target: null };
    expect(warpPhase(place, 150, false)?.phase).toBe('fade');
    expect(warpPhase(place, 2400, false)?.phase).toBe('rise');
    expect(warpPhase({ kind: 'warping-in', startedAt: 0 }, 150, true)).toEqual({ phase: 'fade', progress: 0.5 });
    expect(warpPhase({ kind: 'ship' }, 0, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/place.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/web/state/place.ts`**

```ts
/** Where to land in the world after warping back. */
export interface WorldTarget {
  sessionId: string;
  labId: string;
  scientistId: string | null;
}

/** Where you are: the islands, the ship, or warping between them. */
export type Place = { kind: 'world' } | { kind: 'warping-in'; startedAt: number } | { kind: 'ship' } | { kind: 'warping-out'; startedAt: number; target: WorldTarget | null };

/** What can change the place. */
export type PlaceAction = { type: 'enter'; at: number } | { type: 'leave'; at: number; target?: WorldTarget | null } | { type: 'tick'; at: number; reducedMotion: boolean };

/** Warp phases in milliseconds, on the way in. */
export const WARP = { rise: 600, tunnel: 1600, fade: 300 } as const;

/** The whole warp with reduced motion: a cross-fade. */
export const REDUCED_WARP_MS = 300;

/**
 * How long a warp takes.
 * @param reducedMotion - whether the person prefers reduced motion
 * @returns milliseconds
 */
export function warpDuration(reducedMotion: boolean): number {
  return reducedMotion ? REDUCED_WARP_MS : WARP.rise + WARP.tunnel + WARP.fade;
}

/**
 * The next place.
 * @param place - current place
 * @param action - what happened
 * @returns next place (the same object when nothing changes)
 */
export function placeReducer(place: Place, action: PlaceAction): Place {
  if (action.type === 'enter') return place.kind === 'world' ? { kind: 'warping-in', startedAt: action.at } : place;
  if (action.type === 'leave') return place.kind === 'ship' ? { kind: 'warping-out', startedAt: action.at, target: action.target ?? null } : place;
  if (place.kind !== 'warping-in' && place.kind !== 'warping-out') return place;
  if (action.at - place.startedAt < warpDuration(action.reducedMotion)) return place;
  return place.kind === 'warping-in' ? { kind: 'ship' } : { kind: 'world' };
}

/**
 * Which part of the warp is showing.
 * @param place - current place
 * @param at - current time
 * @param reducedMotion - whether the person prefers reduced motion
 * @returns the phase and how far into it, or null when not warping
 */
export function warpPhase(place: Place, at: number, reducedMotion: boolean): { phase: 'rise' | 'tunnel' | 'fade'; progress: number } | null {
  if (place.kind !== 'warping-in' && place.kind !== 'warping-out') return null;
  const elapsed = Math.max(0, at - place.startedAt);
  if (reducedMotion) return { phase: 'fade', progress: Math.min(1, elapsed / REDUCED_WARP_MS) };
  const phases = place.kind === 'warping-in' ? (['rise', 'tunnel', 'fade'] as const) : (['fade', 'tunnel', 'rise'] as const);
  let start = 0;
  for (const phase of phases) {
    const length = WARP[phase];
    if (elapsed < start + length) return { phase, progress: (elapsed - start) / length };
    start += length;
  }
  return { phase: phases[2], progress: 1 };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/place.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/state/place.ts tests/unit/place.test.ts
git commit -m "feat(web): add the place state machine for warping to the ship"
```

---

### Task 11: Launch tower, ship scene and warp

**Files:**
- Create: `src/web/scene/LaunchTower.tsx`, `src/web/ship/ShipScene.tsx`, `src/web/ship/WarpTunnel.tsx`, `src/web/ship/Bridge.tsx`
- Modify: `src/web/scene/WorldScene.tsx` (render `LaunchTower`; new props `waiting: boolean` and `onEnterShip: () => void`), `src/web/App.tsx` (place switch), `src/web/ui/Hud.tsx` (Command centre button calls `onCommand`, now "enter ship"), `src/web/styles.css`
- Test: `tests/unit/overlay.test.ts` (append a ship-shell test), `tests/e2e/world.spec.ts` (new test)

**Interfaces:**
- Consumes: `placeReducer`, `warpPhase`, `warpDuration`, `Place` and `WorldTarget` (Task 10); `TOWER_RADIUS` (Task 9).
- Produces:
  - `LaunchTower({ waiting, reducedMotion, onEnter })`
  - `ShipScene({ place, now, reducedMotion, waiting, onLeave, screens })`, where `screens: ReactNode` is mounted on the console (Task 12 passes them).
  - `WarpTunnel({ speed })`, where `speed` runs from 0 to 1.
  - `Bridge({ waiting, reducedMotion, onLeave, screens })`
  - `App` keeps `const [place, dispatch] = useReducer(placeReducer, { kind: 'world' })` and ticks it with `requestAnimationFrame` while warping.
  - The DOM always has a `.warp-veil` element whose opacity follows the fade phase, and a "Return to world" button (accessible name exactly `Return to world`) in a `.ship-overlay` while `place.kind === 'ship'`.

- [ ] **Step 1: Write the failing E2E test.** Append to `tests/e2e/world.spec.ts`:

```ts
test('warps to the ship and back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /Command centre/ }).click();
  await expect(page.getByRole('button', { name: 'Return to world' })).toBeVisible();
  await expect(page.locator('.hud__stats')).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to world' }).click();
  await expect(page.locator('.hud__stats')).toContainText('2 sessions');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run build && PW_CHROMIUM_PATH=$(ls ~/.cache/ms-playwright/chromium-1234/*/chrome | head -1) npx playwright test -g "warps to the ship"`
Expected: FAIL; no "Return to world" button.

- [ ] **Step 3: Implement.**

`src/web/scene/LaunchTower.tsx`:

```tsx
import { useRef, type ReactElement } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Mesh, MeshStandardMaterial } from 'three';
import { Island } from './Island';
import { Label } from './Label';
import { TOWER_RADIUS } from './layout';

const TOWER_HEIGHT = 9;
const BEACON_IDLE = '#3a4652';
const BEACON_LIT = '#e86fa8';

/**
 * The launch-tower island at the centre of the world: a lattice tower, a rocket on its pad, and a
 * beacon that flashes while an agent is waiting on you. Clicking it warps to the ship.
 * @param props - whether anyone is waiting, the motion preference and the click handler
 * @returns the island
 */
export function LaunchTower({ waiting, reducedMotion, onEnter }: { waiting: boolean; reducedMotion: boolean; onEnter: () => void }): ReactElement {
  const beacon = useRef<Mesh>(null);
  useFrame((state) => {
    const material = beacon.current?.material as MeshStandardMaterial | undefined;
    if (!material) return;
    const pulse = waiting && !reducedMotion ? 0.5 + Math.sin(state.clock.elapsedTime * 5) * 0.5 : 1;
    material.emissiveIntensity = waiting ? 0.6 + pulse * 2.4 : 0.2;
  });
  const enter = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation();
    onEnter();
  };
  return (
    <group>
      <Island seed="launch-tower" radius={TOWER_RADIUS} onClick={enter} />
      <group position={[0, 0.6, 0]} onClick={enter}>
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[2.4, 2.6, 0.3, 32]} />
          <meshStandardMaterial color="#5b6670" />
        </mesh>
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[1.6 * sx, TOWER_HEIGHT / 2, 1.6 * sz - 0.4]}>
            <boxGeometry args={[0.18, TOWER_HEIGHT, 0.18]} />
            <meshStandardMaterial color="#c4553b" />
          </mesh>
        )))}
        {Array.from({ length: 6 }, (_, index) => (
          <mesh key={index} position={[0, 1 + index * 1.5, -0.4]}>
            <boxGeometry args={[3.4, 0.12, 3.4]} />
            <meshStandardMaterial color="#d9d4c7" wireframe />
          </mesh>
        ))}
        <group position={[0, 0.3, 0.9]}>
          <mesh position={[0, 3, 0]}>
            <cylinderGeometry args={[0.7, 0.7, 6, 24]} />
            <meshStandardMaterial color="#eef1ec" />
          </mesh>
          <mesh position={[0, 6.8, 0]}>
            <coneGeometry args={[0.7, 1.6, 24]} />
            <meshStandardMaterial color="#ff9f1c" />
          </mesh>
          {[0, 1, 2].map((index) => (
            <mesh key={index} position={[Math.cos((index * Math.PI * 2) / 3) * 0.8, 0.6, Math.sin((index * Math.PI * 2) / 3) * 0.8]} rotation={[0, (-index * Math.PI * 2) / 3, 0]}>
              <boxGeometry args={[0.6, 1.2, 0.08]} />
              <meshStandardMaterial color="#ff9f1c" />
            </mesh>
          ))}
        </group>
        <mesh ref={beacon} position={[0, TOWER_HEIGHT + 0.5, -0.4]}>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshStandardMaterial color={waiting ? BEACON_LIT : BEACON_IDLE} emissive={waiting ? BEACON_LIT : BEACON_IDLE} toneMapped={false} />
        </mesh>
      </group>
      <Label position={[0, TOWER_HEIGHT + 2.2, 0]} center zIndexRange={[12, 2]}>
        <button type="button" className="tower-tag" onClick={onEnter} aria-label="Fly to the command centre">
          Launch tower
        </button>
      </Label>
    </group>
  );
}
```

The tower tag's accessible name is "Fly to the command centre", not "Command centre", so `getByRole('button', { name: /Command centre/ })` still finds only the top-bar button. Its visible text is "Launch tower".

`src/web/ship/WarpTunnel.tsx`:

```tsx
import { useMemo, useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, type InstancedMesh } from 'three';

const STARS = 900;
const DEPTH = 240;

/**
 * Stars streaking past the camera; the faster the warp, the longer the streaks.
 * @param props - speed from 0 (drifting) to 1 (full warp)
 * @returns the tunnel
 */
export function WarpTunnel({ speed }: { speed: number }): ReactElement {
  const mesh = useRef<InstancedMesh>(null);
  const stars = useMemo(
    () => Array.from({ length: STARS }, (_, index) => {
      const angle = (index * 2.399963) % (Math.PI * 2);
      const radius = 2 + ((index * 7919) % 1000) / 1000 * 14;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: -((index * 104729) % DEPTH) };
    }),
    [],
  );
  const dummy = useMemo(() => new Object3D(), []);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    const step = (20 + speed * 220) * Math.min(delta, 0.1);
    stars.forEach((star, index) => {
      star.z += step;
      if (star.z > 2) star.z -= DEPTH;
      dummy.position.set(star.x, star.y, star.z);
      dummy.scale.set(1, 1, 1 + speed * 60);
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, STARS]}>
      <boxGeometry args={[0.05, 0.05, 0.12]} />
      <meshBasicMaterial color="#dfe9ff" toneMapped={false} />
    </instancedMesh>
  );
}
```

`src/web/ship/Bridge.tsx`:

```tsx
import { useRef, type ReactElement, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { DoubleSide, type Mesh, type MeshStandardMaterial } from 'three';
import { Label } from '../scene/Label';

/**
 * The ship's bridge: a dark cockpit, a curved console under a wide window onto drifting stars, the
 * console screens, a light that flashes while an agent waits, and the lever back to the world.
 * @param props - whether anyone is waiting, the motion preference, the leave handler and the screens
 * @returns the bridge
 */
export function Bridge({ waiting, reducedMotion, onLeave, screens }: { waiting: boolean; reducedMotion: boolean; onLeave: () => void; screens: ReactNode }): ReactElement {
  const light = useRef<Mesh>(null);
  useFrame((state) => {
    const material = light.current?.material as MeshStandardMaterial | undefined;
    if (material) material.emissiveIntensity = waiting ? (reducedMotion ? 2 : 1 + Math.sin(state.clock.elapsedTime * 6) * 1.5) : 0.1;
  });
  return (
    <group>
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 3, 2]} intensity={14} color="#ffd9a0" />
      <Stars radius={120} depth={60} count={2500} factor={4} fade speed={reducedMotion ? 0 : 0.6} />
      <mesh position={[0, -1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#141b22" />
      </mesh>
      <mesh position={[0, 1.4, -6]}>
        <cylinderGeometry args={[9, 9, 7, 48, 1, true, Math.PI * 1.25, Math.PI * 0.5]} />
        <meshStandardMaterial color="#1c252e" side={DoubleSide} transparent opacity={0.25} />
      </mesh>
      <mesh position={[0, -0.55, -0.6]}>
        <cylinderGeometry args={[3.2, 3.4, 0.9, 48, 1, false, Math.PI * 1.2, Math.PI * 0.6]} />
        <meshStandardMaterial color="#26313b" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh ref={light} position={[2.2, -0.05, -1.9]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color="#e86fa8" emissive="#e86fa8" toneMapped={false} />
      </mesh>
      <group position={[-2.6, -0.3, -1.4]} onClick={onLeave}>
        <mesh position={[0, 0.3, 0]} rotation={[0, 0, 0.35]}>
          <cylinderGeometry args={[0.04, 0.04, 0.7, 8]} />
          <meshStandardMaterial color="#9aa8b6" />
        </mesh>
        <mesh position={[0.12, 0.62, 0]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color="#ff9f1c" />
        </mesh>
      </group>
      <Label position={[0, 0.55, -2.2]} center transform distanceFactor={2.2} zIndexRange={[20, 10]}>
        <div className="console">{screens}</div>
      </Label>
    </group>
  );
}
```

`src/web/ship/ShipScene.tsx`:

```tsx
import { useState, type ReactElement, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { warpPhase, type Place } from '../state/place';
import { Bridge } from './Bridge';
import { WarpTunnel } from './WarpTunnel';

/** Props for the ship scene. */
interface ShipSceneProps {
  place: Place;
  now: number;
  reducedMotion: boolean;
  waiting: boolean;
  onLeave: () => void;
  screens: ReactNode;
}

/**
 * The ship: the warp tunnel while travelling, then the bridge. It has its own canvas, so the world
 * is not drawn while you are on board. If the graphics context is lost mid-warp, it skips the
 * tunnel and shows the bridge.
 * @param props - place, clock, motion preference, waiting flag, leave handler and console screens
 * @returns the scene
 */
export function ShipScene({ place, now, reducedMotion, waiting, onLeave, screens }: ShipSceneProps): ReactElement {
  const [contextLost, setContextLost] = useState(false);
  const phase = warpPhase(place, now, reducedMotion);
  const tunnel = !contextLost && (phase?.phase === 'tunnel' || phase?.phase === 'rise');
  const speed = phase?.phase === 'tunnel' ? Math.sin(phase.progress * Math.PI) : phase?.phase === 'rise' ? phase.progress * 0.3 : 0;
  return (
    <div className="world ship">
      <Canvas className="world-canvas" camera={{ position: [0, 0.6, 2.4], fov: 55 }} dpr={[1, 1.5]} onCreated={({ gl }) => {
          gl.setClearColor('#05080d');
          gl.domElement.addEventListener('webglcontextlost', () => setContextLost(true), { once: true });
        }}>
        {tunnel ? <WarpTunnel speed={speed} /> : <Bridge waiting={waiting} reducedMotion={reducedMotion} onLeave={onLeave} screens={screens} />}
      </Canvas>
    </div>
  );
}
```

The `Label` layer context is provided by the world's `WorldScene`, so `ShipScene` must provide one too. Read how `WorldScene.tsx` creates the label layer (`LabelLayerContext.Provider` and the `.label-layer` div), and wrap the ship `<Canvas>` in the same way.

In `App.tsx`:
- add `const [place, dispatch] = useReducer(placeReducer, { kind: 'world' });`
- add `const [clock, setClock] = useState(0);`
- add a `useEffect` that, while `place.kind` is `warping-in` or `warping-out`, runs `requestAnimationFrame` to `setClock(performance.now())` and `dispatch({ type: 'tick', at: performance.now(), reducedMotion })`;
- `onCommand` becomes `() => dispatch({ type: 'enter', at: performance.now() })`;
- show the world (`WorldScene`, `Hud`, `ViewControls`, `InspectPanel`) when `place.kind === 'world'`, or during `warping-in` while `warpPhase(...)?.phase === 'rise'`;
- otherwise render `<ShipScene … screens={null} />` (Task 12 fills `screens`) and, when `place.kind === 'ship'`, render:

```tsx
        <div className="ship-overlay">
          <button type="button" className="button" onClick={() => dispatch({ type: 'leave', at: performance.now() })}>
            <Icon name="back" />
            Return to world
          </button>
        </div>
```

- always render `<div className="warp-veil" style={{ opacity: veilOpacity }} aria-hidden="true" />`. `veilOpacity` is `phase?.phase === 'fade' ? (place.kind === 'warping-in' ? 1 - phase.progress : phase.progress) : 0`; with reduced motion it fades out and back in through 1 at the midpoint.
- when `place` becomes `world` after `warping-out` with a `target`, call `selectLab(target.sessionId, target.labId, target.scientistId ? { kind: 'scientist', scientistId: target.scientistId } : { kind: 'lab' })`. Track the previous place in a ref to detect this.

During the rise phase, `WorldScene` moves the camera up the tower: pass `rising={phase?.phase === 'rise'}`. In `FocusControls`, when `rising` turns true, call `controls.current?.setLookAt(0, 30, 6, 0, 28, 0, !reducedMotion)`.

In `WorldScene.tsx`, render `<LaunchTower waiting={props.waiting} reducedMotion={props.reducedMotion} onEnter={props.onEnterShip} />` inside the scene beside the continents. `App` passes `waiting={places.length > 0}` and `onEnterShip={() => dispatch({ type: 'enter', at: performance.now() })}`.

Append to `styles.css`:

```css
.ship {
  background: #05080d;
}

.ship-overlay {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 8;
}

.warp-veil {
  position: absolute;
  inset: 0;
  z-index: 9;
  background: #05080d;
  pointer-events: none;
}

.tower-tag {
  padding: 0.3rem 0.7rem;
  border: 1px solid rgb(255 159 28 / 0.6);
  border-radius: var(--radius-control);
  background: var(--surface);
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.console {
  display: grid;
  grid-template-columns: 22rem 30rem;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid rgb(255 159 28 / 0.35);
  border-radius: var(--radius-panel);
  background: linear-gradient(rgb(255 255 255 / 0.02) 50%, transparent 50%) 0 0 / 100% 4px, rgb(10 16 22 / 0.94);
  box-shadow: 0 0 40px rgb(255 159 28 / 0.18);
  pointer-events: auto;
}
```

The label layer sets `div { pointer-events: none }`, so the console needs `.label-layer .console, .label-layer .console * { pointer-events: auto; }` for its inputs to work.

- [ ] **Step 4: Run all gates, E2E included**

Run: `npx vitest run && npm run typecheck && npm run build && PW_CHROMIUM_PATH=$(ls ~/.cache/ms-playwright/chromium-1234/*/chrome | head -1) npm run test:e2e`
Expected: PASS, 9 E2E tests. The old "explains how to turn on the command centre" test would fail, because Command centre now warps instead of opening the drawer, so rewrite it in this task. Task 12 adds the Launch-screen text back:

```ts
test('explains how to turn on the command centre when it is off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /Command centre/ }).click();
  await expect(page.getByRole('button', { name: 'Return to world' })).toBeVisible();
});
```

Task 12 adds the off-state text assertion back.

- [ ] **Step 5: Screenshots and commit.** Capture the tower island and the warp mid-frame from the demo world (Task 14 has the script), look at them, then:

```bash
git add src/web/scene/LaunchTower.tsx src/web/ship src/web/scene/WorldScene.tsx src/web/App.tsx src/web/ui/Hud.tsx src/web/styles.css tests/e2e/world.spec.ts tests/unit/overlay.test.ts
git commit -m "feat(ship): launch tower, warp tunnel and the ship's bridge"
```

---

### Task 12: Console screens and the conversation reader

**Files:**
- Create: `src/web/state/ship.ts`, `src/web/ship/LaunchScreen.tsx`, `src/web/ship/HistoryScreen.tsx`, `src/web/ui/Conversation.tsx`
- Modify: `src/web/App.tsx` (pass `screens`; show the reader overlay for `reading`), `src/web/styles.css`
- Test: `tests/unit/ship-screens.test.ts`, `tests/e2e/world.spec.ts`, `tests/fixtures/fake-claude.mjs`

**Interfaces:**
- Consumes: `/api/projects`, `/api/launches` and `/api/conversations/:id` (Tasks 4–5); `ShipLogEntry`, `ProjectView` and `ConversationItem`; `sendControl` and `apiFetch`.
- Produces:
  - `useProjects(enabled: boolean): { projects: ProjectView[]; error: string | null; reload: () => void }`
  - `useConversation(sessionId: string | null, live: boolean): { items: ConversationItem[]; error: string | null }`: polls every 2 s while `live`.
  - `LaunchScreen({ access, onLaunched })`, where `onLaunched(launchId: string)`.
  - `HistoryScreen({ runs, selectedId, onSelect, onGoToLab, sessions, now })`, where `onGoToLab(target: WorldTarget)`.
  - `Conversation({ items, error })`: a list of chat items; tool calls collapsed to one line `Tool · summary`.
  - Field names: the project select is labelled "Project", the model select "Model", the effort select "Effort", the permissions select "Permissions" and the prompt "Prompt"; the submit button is "Launch".

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/ship-screens.test.ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Conversation } from '../../src/web/ui/Conversation';
import { HistoryScreen } from '../../src/web/ship/HistoryScreen';
import type { ShipLogEntry } from '../../src/shared/types';

const AT = '2026-10-08T10:00:00.000Z';
const run = (overrides: Partial<ShipLogEntry> = {}): ShipLogEntry => ({ id: 'r1', kind: 'launch', sessionId: 's9', projectId: 'p', projectName: 'checkout', promptPreview: 'Add retries', model: 'sonnet', effort: 'high', permissionMode: 'default', startedAt: AT, endedAt: null, state: 'running', exitCode: null, ...overrides });

describe('Conversation', () => {
  it('shows prompts and replies as chat and tool calls on one line', () => {
    const markup = renderToStaticMarkup(createElement(Conversation, { error: null, items: [
      { kind: 'prompt', at: AT, text: 'Add retries' },
      { kind: 'tool', at: AT, toolUseId: 't', tool: 'Edit', summary: 'client.ts', state: 'error' },
      { kind: 'reply', at: AT, text: 'Done.' },
    ] }));
    expect(markup).toContain('chat__item--prompt');
    expect(markup).toContain('chat__item--reply');
    expect(markup).toMatch(/chat__tool chat__tool--error.*Edit.*client\.ts/);
  });

  it('says when the transcript is gone', () => {
    expect(renderToStaticMarkup(createElement(Conversation, { items: [], error: 'This conversation\'s transcript is gone.' }))).toContain('transcript is gone');
  });
});

describe('HistoryScreen', () => {
  it('lists runs with status dots and labels replies', () => {
    const markup = renderToStaticMarkup(createElement(HistoryScreen, { runs: [run(), run({ id: 'r2', kind: 'reply', state: 'failed', exitCode: 2 })], selectedId: null, onSelect: () => undefined, onGoToLab: () => undefined, sessions: [], now: Date.parse(AT) }));
    expect(markup).toContain('Add retries');
    expect(markup).toContain('Running');
    expect(markup).toContain('Failed (exit 2)');
    expect(markup).toContain('Reply to');
  });

  it('says when nothing has been launched yet', () => {
    expect(renderToStaticMarkup(createElement(HistoryScreen, { runs: [], selectedId: null, onSelect: () => undefined, onGoToLab: () => undefined, sessions: [], now: 0 }))).toContain('Nothing launched yet');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/ship-screens.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/web/ui/Conversation.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { ConversationItem } from '../../shared/types';

/**
 * A conversation as chat: your prompts on one side, the agent's replies on the other, and each tool
 * call on a single line with how it ended.
 * @param props - items, or the reason they could not be read
 * @returns the thread
 */
export function Conversation({ items, error }: { items: ConversationItem[]; error: string | null }): ReactElement {
  if (error) return <p className="muted">{error}</p>;
  if (!items.length) return <p className="muted">Nothing has been said yet.</p>;
  return (
    <ol className="chat">
      {items.map((item, index) =>
        item.kind === 'tool' ? (
          <li key={`${item.toolUseId}-${index}`} className={`chat__tool chat__tool--${item.state}`}>
            <span className="mono">{item.tool}</span> · {item.summary}
          </li>
        ) : (
          <li key={index} className={`chat__item chat__item--${item.kind}`}>
            {item.text}
          </li>
        ),
      )}
    </ol>
  );
}
```

`src/web/state/ship.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { ConversationItem, ProjectView } from '../../shared/types';
import { apiFetch } from './access';

const POLL_MS = 2000;

/**
 * The projects a fresh conversation can start in.
 * @param enabled - whether the command centre is on
 * @returns projects, an error and a reload function
 */
export function useProjects(enabled: boolean): { projects: ProjectView[]; error: string | null; reload: () => void } {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    apiFetch('/api/projects', { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ result: ProjectView[] }>) : Promise.reject(new Error(String(response.status)))))
      .then((body) => {
        setProjects(body.result);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('agent-world: could not load projects', reason);
        setError('Could not load the project list.');
      });
    return () => controller.abort();
  }, [enabled, round]);
  return { projects, error, reload: useCallback(() => setRound((value) => value + 1), []) };
}

/**
 * A conversation, refetched every 2 seconds while its session is live.
 * @param sessionId - session to read, or null for none
 * @param live - whether to keep polling
 * @returns items and an error
 */
export function useConversation(sessionId: string | null, live: boolean): { items: ConversationItem[]; error: string | null } {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionId) return undefined;
    let stopped = false;
    const load = (): void => {
      apiFetch(`/api/conversations/${encodeURIComponent(sessionId)}`)
        .then(async (response) => {
          const body = (await response.json()) as { items?: ConversationItem[]; error?: string };
          if (stopped) return;
          if (response.ok) {
            setItems(body.items ?? []);
            setError(null);
          } else {
            setError(response.status === 404 ? body.error ?? 'This conversation is not available.' : `Could not read it (${response.status}).`);
          }
        })
        .catch((reason: unknown) => {
          console.warn('agent-world: could not read the conversation', reason);
          if (!stopped) setError('Agent World is not reachable. Is it still running?');
        });
    };
    load();
    const timer = live ? setInterval(load, POLL_MS) : null;
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [sessionId, live]);
  return { items, error };
}
```

`src/web/ship/LaunchScreen.tsx`:

```tsx
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { sendControl, type ControlAccess } from '../state/control';
import { useProjects } from '../state/ship';
import { Icon } from '../ui/icons';

const MODES = { default: 'Ask before risky actions', acceptEdits: 'Accept file edits', plan: 'Plan only, change nothing' } as const;
const MODELS = { '': 'Default model', opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', fable: 'Fable' } as const;
const EFFORTS = { '': 'Default effort', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' } as const;

/**
 * The Launch screen: start a fresh conversation in a project, with its permissions, model and effort.
 * @param props - access and what to do once launched
 * @returns the screen
 */
export function LaunchScreen({ access, onLaunched }: { access: ControlAccess; onLaunched: (launchId: string) => void }): ReactElement {
  const { projects, error: listError, reload } = useProjects(access.enabled);
  const [projectId, setProjectId] = useState('');
  const [mode, setMode] = useState<keyof typeof MODES>('default');
  const [model, setModel] = useState<keyof typeof MODELS>('');
  const [effort, setEffort] = useState<keyof typeof EFFORTS>('');
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' } | { kind: 'error'; text: string }>({ kind: 'idle' });

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const launch = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    if (state.kind === 'sending' || !prompt.trim() || !projectId) return;
    setState({ kind: 'sending' });
    const reply = await sendControl<{ launchId: string; sessionId: string }>(access, '/api/launches', { projectId, prompt, permissionMode: mode, model, effort });
    if (!reply.ok) {
      setState({ kind: 'error', text: reply.error });
      if (reply.error.includes('no longer exists') || reply.error.includes('not in the list')) reload();
      return;
    }
    setPrompt('');
    setState({ kind: 'idle' });
    onLaunched(reply.result.launchId);
  };

  if (!access.enabled) {
    return (
      <section className="screen" aria-label="Launch">
        <h2 className="screen__title">Launch</h2>
        <p className="muted">The command centre is off, so Agent World only watches. To launch conversations, restart it with:</p>
        <pre className="command__code">npm start -- --allow-control</pre>
        <p className="muted">To answer agent questions and permission prompts in the world as well, add the hook it prints with:</p>
        <pre className="command__code">node dist/server/cli.js hooks</pre>
      </section>
    );
  }
  return (
    <form className="screen" aria-label="Launch" onSubmit={(event) => void launch(event)}>
      <h2 className="screen__title">Launch a fresh conversation</h2>
      <label className="field">
        <span className="field__label">Project</span>
        <select className="field__input" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
              {project.branch ? ` (${project.branch})` : ''}
              {project.live ? ' · live' : ''}
            </option>
          ))}
        </select>
      </label>
      {listError && <p className="notice-inline notice-inline--error">{listError}</p>}
      <div className="screen__row">
        <label className="field">
          <span className="field__label">Permissions</span>
          <select className="field__input" value={mode} onChange={(event) => setMode(event.target.value as keyof typeof MODES)}>
            {(Object.keys(MODES) as Array<keyof typeof MODES>).map((key) => <option key={key} value={key}>{MODES[key]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Model</span>
          <select className="field__input" value={model} onChange={(event) => setModel(event.target.value as keyof typeof MODELS)}>
            {(Object.keys(MODELS) as Array<keyof typeof MODELS>).map((key) => <option key={key} value={key}>{MODELS[key]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Effort</span>
          <select className="field__input" value={effort} onChange={(event) => setEffort(event.target.value as keyof typeof EFFORTS)}>
            {(Object.keys(EFFORTS) as Array<keyof typeof EFFORTS>).map((key) => <option key={key} value={key}>{EFFORTS[key]}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">Prompt</span>
        <textarea
          className="field__input field__input--prompt"
          rows={6}
          value={prompt}
          placeholder="Describe the work, as you would in Claude Code"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void launch();
          }}
        />
      </label>
      <button type="submit" className="button button--primary" disabled={state.kind === 'sending' || !prompt.trim() || !projectId}>
        <Icon name="command" />
        {state.kind === 'sending' ? 'Launching…' : 'Launch'}
      </button>
      {state.kind === 'error' && <p className="notice-inline notice-inline--error" role="status">{state.text}</p>}
      <small className="muted">Ctrl+Enter launches. Each launch uses your Claude usage and rises as its own island.</small>
    </form>
  );
}
```

`src/web/ship/HistoryScreen.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { SessionSummary, ShipLogEntry } from '../../shared/types';
import type { WorldTarget } from '../state/place';
import { useConversation } from '../state/ship';
import { Conversation } from '../ui/Conversation';
import { preview, timeAgo } from '../ui/format';
import { Icon } from '../ui/icons';

/** Props for the History screen. */
interface HistoryScreenProps {
  runs: ShipLogEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGoToLab: (target: WorldTarget) => void;
  sessions: SessionSummary[];
  now: number;
}

/**
 * The History screen: conversations the ship launched (and replies sent from lab panels), newest
 * first, and the selected one read as chat.
 * @param props - runs, selection, live sessions and handlers
 * @returns the screen
 */
export function HistoryScreen({ runs, selectedId, onSelect, onGoToLab, sessions, now }: HistoryScreenProps): ReactElement {
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0] ?? null;
  const session = selected?.sessionId ? sessions.find((candidate) => candidate.sessionId === selected.sessionId) : undefined;
  const { items, error } = useConversation(selected?.sessionId ?? null, selected?.state === 'running' || Boolean(session));
  const newestLab = session?.labs.at(-1);
  return (
    <section className="screen" aria-label="History">
      <h2 className="screen__title">History</h2>
      {!runs.length ? (
        <p className="muted">Nothing launched yet. Conversations you launch appear here.</p>
      ) : (
        <div className="history">
          <ul className="list history__list">
            {runs.map((run) => (
              <li key={run.id}>
                <button type="button" className="row" aria-pressed={run.id === selected?.id} onClick={() => onSelect(run.id)}>
                  <span className="row__main">
                    <span className={`status-dot status-dot--${dotFor(run)}`} aria-hidden="true" />
                    {run.kind === 'reply' ? 'Reply to ' : ''}
                    {preview(run.promptPreview, 48)}
                  </span>
                  <span className="row__sub">
                    {stateLabel(run)} · {run.projectName} · {timeAgo(run.startedAt, now)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="history__thread">
            {selected?.sessionId ? <Conversation items={items} error={error} /> : <p className="muted">This reply has no conversation to show here; read it from its island.</p>}
            {session && newestLab && (
              <button type="button" className="button" onClick={() => onGoToLab({ sessionId: session.sessionId, labId: newestLab.id, scientistId: null })}>
                <Icon name="back" />
                Go to its lab
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * A run's state in words.
 * @param run - the run
 * @returns label
 */
function stateLabel(run: ShipLogEntry): string {
  if (run.state === 'running') return 'Running';
  if (run.state === 'finished') return 'Finished';
  return run.exitCode === null ? 'Failed' : `Failed (exit ${run.exitCode})`;
}

/**
 * The status dot for a run.
 * @param run - the run
 * @returns dot modifier
 */
function dotFor(run: ShipLogEntry): string {
  return run.state === 'running' ? 'working' : run.state === 'finished' ? 'done' : 'failed';
}
```

Add `.status-dot--failed { background: var(--stopped); }` to the CSS.

In `App.tsx`, pass `screens` to `ShipScene`:

```tsx
            screens={
              <>
                <LaunchScreen access={access} onLaunched={(launchId) => setSelectedRun(launchId)} />
                <HistoryScreen runs={world?.control?.runs ?? []} selectedId={selectedRun} onSelect={setSelectedRun} onGoToLab={(target) => dispatch({ type: 'leave', at: performance.now(), target })} sessions={world?.sessions ?? []} now={now} />
              </>
            }
```

with `const [selectedRun, setSelectedRun] = useState<string | null>(null);`.

Reader overlay in the world: when `reading` is set, render this, using `useConversation(reading, true)` in a small `ReaderPanel` component defined at the end of `App.tsx`:

```tsx
        <aside className="panel reader" aria-label="Conversation">
          <header className="panel__header">
            <div className="panel__heading">
              <h2 className="panel__title">Conversation</h2>
            </div>
            <button type="button" className="icon-button" onClick={() => setReading(null)} aria-label="Close conversation" title="Close">
              <Icon name="close" />
            </button>
          </header>
          <div className="panel__body">
            <Conversation items={items} error={error} />
          </div>
        </aside>
```

Escape on the ship: add a `keydown` listener while `place.kind === 'ship'`. It calls `dispatch({ type: 'leave', … })` only when `!(event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')`. That is Review Focus #5. The existing Escape handler (`clearSelection`) only runs in the world.

Append to `styles.css`:

```css
.screen {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.screen__title {
  margin: 0;
  color: var(--accent);
  font-size: var(--step--2);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.screen__row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.history {
  display: grid;
  grid-template-columns: 12rem 1fr;
  gap: 0.75rem;
  max-height: 26rem;
}

.history__list,
.history__thread {
  overflow-y: auto;
}

.history__thread {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.row[aria-pressed='true'] {
  border-color: var(--accent);
}

.chat {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chat__item {
  max-width: 85%;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.chat__item--prompt {
  align-self: flex-end;
  border-color: rgb(255 159 28 / 0.45);
  background: var(--accent-soft);
}

.chat__item--reply {
  align-self: flex-start;
  background: var(--surface-raised);
}

.chat__tool {
  padding-left: 0.6rem;
  border-left: 2px solid var(--done);
  color: var(--text-muted);
  font-size: var(--step--1);
  overflow-wrap: anywhere;
}

.chat__tool--running {
  border-left-color: var(--working);
}

.chat__tool--error {
  border-left-color: var(--stopped);
}
```

- [ ] **Step 4: Add the fake `claude` and the E2E tests.**

`tests/fixtures/fake-claude.mjs` (plain Node, no dependencies):

```js
#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const sessionId = args[args.indexOf('--session-id') + 1];
const prompt = args.at(-1);
const claudeDir = process.env.FAKE_CLAUDE_DIR;
if (claudeDir && sessionId) {
  const folder = join(claudeDir, 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'));
  mkdirSync(folder, { recursive: true });
  const now = new Date().toISOString();
  const lines = [
    { type: 'user', timestamp: now, cwd: process.cwd(), origin: { kind: 'human' }, message: { role: 'user', content: prompt } },
    { type: 'assistant', timestamp: now, message: { role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Fake reply: done.' }] } },
  ];
  writeFileSync(join(folder, `${sessionId}.jsonl`), lines.map((line) => `${JSON.stringify(line)}\n`).join(''));
}
```

Check the human-prompt line shape against `humanPrompt()` in `tests/fixtures/lines.ts` and copy its exact fields. Make the file executable as part of this task with `chmod +x tests/fixtures/fake-claude.mjs`.

In `tests/e2e/world.spec.ts`:
1. Start the main E2E server with `--allow-control --claude-bin tests/fixtures/fake-claude.mjs`, `env: { ...process.env, HOME: homeDir, FAKE_CLAUDE_DIR: claudeDir }`. `homeDir` comes from `mkdtempSync`, so `server.json` and `ship-log.json` never touch the real home.
2. Add a third live session whose `cwd` is a real temporary folder (`appDir = mkdtempSync(...)`), so it appears in the project list and passes the folder check.
3. Start a second server **without** `--allow-control` (`offUrl`) for the off-state test, and restore its text assertions:

```ts
test('explains how to turn on the command centre when it is off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(offUrl);
  await page.getByRole('button', { name: /Command centre/ }).click();
  const launch = page.getByRole('region', { name: 'Launch' });
  await expect(launch).toContainText('The command centre is off');
  await expect(launch).toContainText('--allow-control');
});

test('launches a fresh conversation from the ship and reads it in History', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /Command centre/ }).click();
  const options = await page.getByLabel('Project').locator('option').allTextContents();
  await page.getByLabel('Project').selectOption({ index: options.findIndex((text) => text.includes(basename(appDir))) });
  await page.getByLabel('Prompt').fill('Write a haiku about retries');
  await page.getByRole('button', { name: 'Launch' }).click();
  const history = page.getByRole('region', { name: 'History' });
  await expect(history).toContainText('Write a haiku about retries');
  await expect(history).toContainText('Fake reply: done.');
});
```

The off-state Launch screen is a `<section aria-label="Launch">`, which has the implicit role `region`; the control-on screen is a `<form aria-label="Launch">`, role `form`. History is a `<section aria-label="History">`, role `region`.

4. Add the "answers a question in the agent's panel" test. Give the side session's transcript a pending `AskUserQuestion` call (`toolUse('q1', 'AskUserQuestion', { questions: [{ question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Blue', description: '' }, { label: 'Red', description: '' }] }] })`). Run `dist/server/hook.js` with `HOME: homeDir` and input `{ session_id: SIDE_SESSION, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_use_id: 'q1', tool_input: { questions: [...] } }`. Then:

```ts
  await page.getByRole('button', { name: /1 waiting/ }).click();
  const panel = page.getByRole('complementary');
  await expect(panel).toContainText('Which colour?');
  await panel.getByRole('button', { name: /Blue/ }).click();
  await panel.getByRole('button', { name: 'Send answer' }).click();
  const { stdout } = await hook.done;
  expect(stdout).toContain('Blue');
```

5. Add the "replies from the lab panel" test: open a lab, fill "Reply to this session", press "Send reply", and expect the status text "Sent. A copy of this session".

- [ ] **Step 5: Run all gates**

Run: `npx vitest run && npx vitest run --coverage && npm run typecheck && npm run build && PW_CHROMIUM_PATH=$(ls ~/.cache/ms-playwright/chromium-1234/*/chrome | head -1) npm run test:e2e`
Expected: PASS; coverage ≥ 80%; E2E 12 tests.

- [ ] **Step 6: Commit**

```bash
git add src/web/state/ship.ts src/web/ship/LaunchScreen.tsx src/web/ship/HistoryScreen.tsx src/web/ui/Conversation.tsx src/web/App.tsx src/web/styles.css tests/unit/ship-screens.test.ts tests/e2e/world.spec.ts tests/fixtures/fake-claude.mjs
git commit -m "feat(ship): launch and history screens on the console, and a conversation reader"
```

---

### Task 13: Remove the drawer and the request cards

**Files:**
- Delete: `src/web/ui/CommandCentre.tsx`, `src/web/ui/RequestCards.tsx`
- Modify: `src/web/App.tsx` (remove `commandOpen`, the drawer and `<RequestCards>`), `src/web/styles.css` (delete `.command`, `.command__form`, `.run`, `.run__*`, `.requests` and `.request`; keep `.command__code` and the `.request__*` element classes that `RequestForm` uses)
- Test: `tests/unit/overlay.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync } from 'node:fs';

describe('old command centre', () => {
  it('is gone: no drawer and no request cards', () => {
    expect(existsSync('src/web/ui/CommandCentre.tsx')).toBe(false);
    expect(existsSync('src/web/ui/RequestCards.tsx')).toBe(false);
  });
});
```

Add a matching test for Review Focus #5 to the E2E file: on the ship, type "draft" into the Prompt, press Escape, and expect `Return to world` still visible and the prompt still holding "draft".

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/unit/overlay.test.ts`
Expected: FAIL.

- [ ] **Step 3: Delete and clean up**

```bash
git rm src/web/ui/CommandCentre.tsx src/web/ui/RequestCards.tsx
```

Remove their imports and uses from `App.tsx`, and delete the CSS blocks named above. Then run `grep -rn "CommandCentre\|RequestCards\|commandOpen" src tests` and expect no output.

- [ ] **Step 4: Run all gates**

Run: `npx vitest run && npm run typecheck && npm run build && PW_CHROMIUM_PATH=$(ls ~/.cache/ms-playwright/chromium-1234/*/chrome | head -1) npm run test:e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/App.tsx src/web/styles.css tests/unit/overlay.test.ts tests/e2e/world.spec.ts
git commit -m "refactor(web): remove the command-centre drawer and the request cards"
```

---

### Task 14: Docs and screenshots

**Files:**
- Modify: `README.md` (command-centre section, "Using the world" table, privacy section: ship log), `docs/design.md` (Command centre section, Security bullets, UI section)
- Modify: `docs/images/world.jpg`, `docs/images/lab-panel.jpg`; add `docs/images/ship.jpg`

- [ ] **Step 1: Update `README.md`.** Replace the "Command centre (optional)" table rows with:

| You can | How it works |
|---|---|
| **Launch a fresh conversation** (launch tower, or Command centre in the top bar) | Warp to the ship, pick a project (live, or worked in during the last 30 days), permissions, model and effort, and write the prompt. Runs `claude -p --session-id <new id>` in that folder; it rises as its own island and stays in the ship's History. |
| **Reply to a session** (lab panel) | Runs `claude -p --resume <id> --fork-session`: a copy with the whole conversation, so the session open in your editor is never written into. |
| **Ask what a lab or agent did** (side panel) | Unchanged. |
| **Answer agent questions and permission prompts** | With the hook, a waiting agent's bubble pulses and the top bar shows "N waiting"; answer in that agent's panel. After 120 seconds the normal dialog appears in the session. |

Under Privacy add: "**Ship history.** Launches and replies are listed in `~/.agent-world/ship-log.json` (only you can read it) with a 280-character prompt preview; delete the file to clear it."

- [ ] **Step 2: Update `docs/design.md`.** In the Command centre table, replace the "New task in a project" row with the launch row above. Add rows for `GET /api/projects`, `POST /api/launches` and `GET /api/conversations/:sessionId`, with the limits from the spec. Add the ship log under Security. Replace the HUD/UI bullets that mention the drawer and cards.

- [ ] **Step 3: Regenerate the README images from the demo world**

```bash
cp /home/tops/agent-world-notes/demo-shot.ts ./demo-shot.ts
sed -i "s#await page.getByRole('button', { name: /Add retries to the payment client/ }).first().click();#await page.getByRole('navigation', { name: 'Sessions' }).getByRole('button', { name: /Add retries/ }).click();#" demo-shot.ts
PW_CHROMIUM_PATH=$(ls ~/.cache/ms-playwright/chromium-1234/*/chrome | head -1) node --import tsx demo-shot.ts
rm demo-shot.ts
```

For `ship.jpg`, extend a scratchpad copy of the screenshot script, never committed, so that it:
- starts the server with `--allow-control`, a temporary `HOME`, and `--claude-bin tests/fixtures/fake-claude.mjs`;
- emulates reduced motion and clicks Command centre;
- waits 2 s and saves `docs/images/ship.jpg` as JPEG quality 82.

Add `![The ship's bridge: launch a fresh conversation and read its history](docs/images/ship.jpg)` under the command-centre heading.

- [ ] **Step 4: Run every gate**

Run: `npm run typecheck && npx vitest run && npx vitest run --coverage && npm run build && PW_CHROMIUM_PATH=$(ls ~/.cache/ms-playwright/chromium-1234/*/chrome | head -1) npm run test:e2e`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/design.md docs/images/world.jpg docs/images/lab-panel.jpg docs/images/ship.jpg
git commit -m "docs: describe the command centre ship"
```
