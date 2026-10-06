import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { Lab, Session, SessionInfo, WorldSummary } from '../shared/types.js';
import { extractMeta, normalizeLine } from './normalize.js';
import { findTranscript, listLiveSessions } from './registry.js';
import { summarizeWorld } from './summary.js';
import { JsonlTailer } from './tailer.js';
import { applyMainEvents, applySubagentEvents, createSession, type SubagentMeta } from './world.js';

/** Engine settings. */
export interface EngineOptions {
  claudeDir: string;
  now?: () => number;
}

type Listener = () => void;

interface Watched {
  session: Session;
  main: JsonlTailer | null;
  subagents: Map<string, { tailer: JsonlTailer; meta: SubagentMeta | null; waits: number }>;
}

const AGENT_FILE = /^agent-(.+)\.jsonl$/;
const MAX_SUBAGENT_WAITS = 5;

/**
 * Keeps the world in sync with Claude Code's files. Each tick refreshes the live-session list,
 * reads newly appended transcript lines for live sessions and their subagents, and folds them
 * into the world. Nothing under the Claude folder is ever written.
 */
export class Engine {
  private readonly watched = new Map<string, Watched>();
  private readonly listeners = new Set<Listener>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private readonly now: () => number;

  /**
   * @param options - engine settings
   */
  constructor(private readonly options: EngineOptions) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Run one sync pass.
   * @returns true when the world changed
   */
  async tick(): Promise<boolean> {
    const live = await listLiveSessions(this.options.claudeDir);
    let changed = this.dropClosed(new Set(live.map((info) => info.sessionId)));
    for (const info of live) {
      try {
        changed = (await this.syncSession(info)) || changed;
      } catch (error) {
        report(`session ${info.sessionId}`, error);
      }
    }
    if (changed) this.listeners.forEach((listener) => listener());
    return changed;
  }

  /**
   * Start polling.
   * @param intervalMs - delay between ticks
   */
  start(intervalMs: number): void {
    if (this.timer) return;
    const run = async (): Promise<void> => {
      if (this.ticking) return;
      this.ticking = true;
      try {
        await this.tick();
      } catch (error) {
        report('sync', error);
      } finally {
        this.ticking = false;
      }
    };
    void run();
    this.timer = setInterval(() => void run(), intervalMs);
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Subscribe to world changes.
   * @param listener - called after a tick that changed the world
   * @returns unsubscribe function
   */
  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The light world view for the browser.
   * @returns world summary
   */
  summary(): WorldSummary {
    return summarizeWorld(
      [...this.watched.values()].map((entry) => entry.session),
      this.now(),
    );
  }

  /**
   * Full detail of one lab.
   * @param sessionId - session id
   * @param labId - lab id
   * @returns the lab, or null when unknown
   */
  lab(sessionId: string, labId: string): Lab | null {
    return this.watched.get(sessionId)?.session.labs.find((lab) => lab.id === labId) ?? null;
  }

  /**
   * Registry details of a live session, from Claude Code's own registry.
   * @param sessionId - session id
   * @returns the session's registry info, or undefined when it is not live
   */
  liveSession(sessionId: string): SessionInfo | undefined {
    const session = this.watched.get(sessionId)?.session;
    if (!session) return undefined;
    return { sessionId: session.sessionId, pid: session.pid, cwd: session.cwd, kind: session.kind, entrypoint: session.entrypoint, startedAt: session.startedAt };
  }

  /**
   * Forget sessions that are no longer live.
   * @param liveIds - ids of live sessions
   * @returns true when any session was removed
   */
  private dropClosed(liveIds: Set<string>): boolean {
    let changed = false;
    for (const id of [...this.watched.keys()]) {
      if (!liveIds.has(id)) {
        this.watched.delete(id);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Bring one live session up to date.
   * @param info - registry data
   * @returns true when it changed
   */
  private async syncSession(info: SessionInfo): Promise<boolean> {
    let entry = this.watched.get(info.sessionId);
    const isNew = !entry;
    if (!entry) {
      entry = { session: createSession(info), main: null, subagents: new Map() };
      this.watched.set(info.sessionId, entry);
    }
    if (!entry.main) {
      const path = await findTranscript(this.options.claudeDir, info.sessionId);
      if (!path) return isNew;
      entry.main = new JsonlTailer(path);
    }
    const mainChanged = await this.readMain(entry, info);
    const subagentsChanged = await this.readSubagents(entry);
    return isNew || mainChanged || subagentsChanged;
  }

  /**
   * Fold new main-transcript lines into the session; a shrunk file rebuilds it from scratch.
   * @param entry - watched session
   * @param info - registry data
   * @returns true when lines were applied
   */
  private async readMain(entry: Watched, info: SessionInfo): Promise<boolean> {
    if (!entry.main) return false;
    const { lines, reset } = await entry.main.readNew();
    if (reset) {
      entry.session = createSession(info);
      entry.subagents.clear();
    }
    if (!lines.length) return reset;
    let session = entry.session;
    for (const line of lines) {
      const meta = extractMeta(line);
      if (meta.branch && meta.branch !== session.branch) session = { ...session, branch: meta.branch };
      if (meta.title && meta.title !== session.title) session = { ...session, title: meta.title };
    }
    entry.session = applyMainEvents(
      session,
      lines.flatMap((line) => normalizeLine(line)),
    );
    return true;
  }

  /**
   * Discover subagent transcripts beside the main one and fold in their new lines.
   * @param entry - watched session
   * @returns true when lines were applied
   */
  private async readSubagents(entry: Watched): Promise<boolean> {
    if (!entry.main) return false;
    const folder = join(dirname(entry.main.path), basename(entry.main.path, '.jsonl'), 'subagents');
    let names: string[];
    try {
      names = await readdir(folder);
    } catch {
      return false;
    }
    const agentIds = names.flatMap((name) => AGENT_FILE.exec(name)?.[1] ?? []).sort();
    let changed = false;
    const deferred: string[] = [];
    for (const agentId of agentIds) {
      const result = await this.syncSubagent(entry, folder, agentId);
      if (result === 'deferred') deferred.push(agentId);
      changed = result === 'changed' || changed;
    }
    for (const agentId of deferred) {
      changed = (await this.syncSubagent(entry, folder, agentId)) === 'changed' || changed;
    }
    return changed;
  }

  /**
   * Fold one subagent's new lines into the session. A subagent is held back (for a few ticks at
   * most) while its meta file is missing or the Agent call that spawned it has not been read yet,
   * so it lands in the right lab instead of the newest one.
   * @param entry - watched session
   * @param folder - subagent folder
   * @param agentId - subagent id
   * @returns whether lines were applied, the subagent was held back, or nothing changed
   */
  private async syncSubagent(entry: Watched, folder: string, agentId: string): Promise<'changed' | 'deferred' | 'unchanged'> {
    try {
      let watcher = entry.subagents.get(agentId);
      if (!watcher) {
        watcher = { tailer: new JsonlTailer(join(folder, `agent-${agentId}.jsonl`)), meta: null, waits: 0 };
        entry.subagents.set(agentId, watcher);
      }
      watcher.meta ??= await readMeta(join(folder, `agent-${agentId}.meta.json`));
      if (watcher.waits < MAX_SUBAGENT_WAITS && !isPlaceable(entry.session, agentId, watcher.meta)) {
        watcher.waits += 1;
        return 'deferred';
      }
      const { lines } = await watcher.tailer.readNew();
      if (!lines.length) return 'unchanged';
      entry.session = applySubagentEvents(
        entry.session,
        agentId,
        watcher.meta ?? {},
        lines.flatMap((line) => normalizeLine(line)),
      );
      return 'changed';
    } catch (error) {
      report(`subagent ${agentId}`, error);
      return 'unchanged';
    }
  }
}

/**
 * Whether a subagent's lab can be determined now: its meta is known, and the Agent call that
 * spawned it (if named) has been read, or the subagent is already placed.
 * @param session - current session
 * @param agentId - subagent id
 * @param meta - its meta, or null when the meta file is not there yet
 * @returns true when it can be placed
 */
function isPlaceable(session: Session, agentId: string, meta: SubagentMeta | null): boolean {
  if (session.agentLabs[agentId]) return true;
  if (!meta) return false;
  return !meta.toolUseId || meta.toolUseId in session.pendingSpawns;
}

/**
 * Log a sync failure without stopping the engine.
 * @param what - what was being synced
 * @param error - the failure
 */
function report(what: string, error: unknown): void {
  process.stderr.write(`agent-world: could not read ${what}: ${(error as Error).message}\n`);
}

/**
 * Read a subagent's meta file.
 * @param path - meta file path
 * @returns meta, or null when the file is missing or not yet complete
 */
async function readMeta(path: string): Promise<SubagentMeta | null> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    return {
      ...(typeof raw.agentType === 'string' ? { agentType: raw.agentType } : {}),
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
      ...(typeof raw.toolUseId === 'string' ? { toolUseId: raw.toolUseId } : {}),
      ...(typeof raw.spawnDepth === 'number' ? { spawnDepth: raw.spawnDepth } : {}),
    };
  } catch {
    return null;
  }
}
