import { baseName } from '../shared/tools.js';
import type { ActionEntry, FileChange, Lab, Scientist, ScientistStatus, Session, SessionInfo, TimelineEntry, WorldEvent } from '../shared/types.js';

/** Most actions kept in one scientist's feed. */
export const MAX_ACTIONS = 200;
/** Most entries kept in one lab's replay timeline. */
export const MAX_TIMELINE = 2000;
/** Most changes kept on one lab's changes board. */
export const MAX_CHANGES = 2000;
/** Most characters kept of one change's before or after text. */
export const MAX_CHANGE_TEXT = 100_000;

const MAIN = 'main';

/** What a subagent's `.meta.json` says about it. */
export interface SubagentMeta {
  agentType?: string;
  description?: string;
  toolUseId?: string;
  spawnDepth?: number;
}

/**
 * An empty continent for a live session.
 * @param info - registry data for the session
 * @returns session with no labs
 */
export function createSession(info: SessionInfo): Session {
  return { ...info, project: baseName(info.cwd) || info.cwd, branch: '', title: '', labs: [], pendingSpawns: {}, agentLabs: {} };
}

/**
 * Apply events from the main agent's transcript. A prompt opens a lab; everything else is the
 * main scientist working in the newest lab. Activity before the first prompt is ignored.
 * @param session - current session
 * @param events - events in transcript order
 * @returns the new session
 */
export function applyMainEvents(session: Session, events: WorldEvent[]): Session {
  return events.reduce((current, event) => {
    if (event.kind === 'prompt') return openLab(current, event);
    const lab = current.labs.at(-1);
    return lab ? step(current, lab.id, MAIN, event) : current;
  }, session);
}

/**
 * Apply events from one subagent's transcript. The subagent works in the lab whose transcript
 * holds the Agent call that spawned it, falling back to the newest lab.
 * @param session - current session
 * @param agentId - subagent id
 * @param meta - the subagent's meta file
 * @param events - events in transcript order
 * @returns the new session
 */
export function applySubagentEvents(session: Session, agentId: string, meta: SubagentMeta, events: WorldEvent[]): Session {
  const work = events.filter((event) => event.kind !== 'prompt');
  const first = work[0];
  if (!first) return session;
  const pending = meta.toolUseId ? session.pendingSpawns[meta.toolUseId] : undefined;
  const labId = session.agentLabs[agentId] ?? pending?.labId ?? session.labs.at(-1)?.id;
  const lab = session.labs.find((candidate) => candidate.id === labId);
  if (!lab) return session;

  let current: Session = { ...session, agentLabs: { ...session.agentLabs, [agentId]: lab.id } };
  if (!lab.scientists[agentId]) {
    const parentId = pending?.parentId ?? MAIN;
    const parentDepth = lab.scientists[parentId]?.depth ?? 0;
    const scientist = newScientist({
      id: agentId,
      role: meta.agentType || pending?.spawn.role || 'agent',
      description: meta.description || pending?.spawn.description || '',
      instruction: pending?.spawn.instruction || meta.description || '',
      parentId,
      depth: meta.spawnDepth ?? parentDepth + 1,
      model: pending?.spawn.model ?? '',
      at: first.at,
    });
    current = replaceLab(current, {
      ...lab,
      scientists: { ...lab.scientists, [agentId]: scientist },
      timeline: insertByTime(lab.timeline, { at: first.at, scientistId: agentId, status: scientist.status }),
      version: lab.version + 1,
    });
  }
  return work.reduce((acc, event) => step(acc, lab.id, agentId, event), current);
}

/**
 * Open a new lab for a human prompt, with the main scientist starting to think.
 * @param session - current session
 * @param event - the prompt event
 * @returns the new session
 */
function openLab(session: Session, event: Extract<WorldEvent, { kind: 'prompt' }>): Session {
  const index = session.labs.length + 1;
  const id = session.labs.some((lab) => lab.id === event.promptId) ? `${event.promptId}-${index}` : event.promptId;
  const previous = session.labs.at(-1)?.scientists[MAIN];
  const main = newScientist({
    id: MAIN,
    role: MAIN,
    description: '',
    instruction: event.text,
    parentId: null,
    depth: 0,
    model: previous?.model ?? '',
    effort: previous?.effort ?? '',
    at: event.at,
  });
  const lab: Lab = {
    id,
    index,
    prompt: event.text,
    startedAt: event.at,
    updatedAt: event.at,
    scientists: { [MAIN]: main },
    changes: [],
    timeline: [{ at: event.at, scientistId: MAIN, status: main.status }],
    version: 1,
  };
  return { ...session, labs: [...session.labs, lab] };
}

/**
 * Apply one event to one scientist in one lab, plus the session-level spawn bookkeeping.
 * @param session - current session
 * @param labId - lab the scientist works in
 * @param scientistId - scientist id
 * @param event - the event
 * @returns the new session
 */
function step(session: Session, labId: string, scientistId: string, event: WorldEvent): Session {
  const lab = session.labs.find((candidate) => candidate.id === labId);
  const before = lab?.scientists[scientistId];
  if (!lab || !before) return session;

  const after = { ...advance(before, event), updatedAt: event.at || before.updatedAt };
  const moved = after.status !== before.status || after.current?.toolUseId !== before.current?.toolUseId;
  const timeline = moved
    ? insertByTime(lab.timeline, { at: event.at, scientistId, status: after.status, tool: after.current?.tool, summary: after.current?.summary })
    : lab.timeline;
  const changes =
    event.kind === 'tool' && event.change
      ? capped([...lab.changes, { ...boundedChange(event.change), at: event.at, scientistId, toolUseId: event.toolUseId }], MAX_CHANGES)
      : lab.changes;

  const next = replaceLab(session, {
    ...lab,
    scientists: { ...lab.scientists, [scientistId]: after },
    timeline,
    changes,
    updatedAt: event.at || lab.updatedAt,
    version: lab.version + 1,
  });
  return trackSpawns(next, labId, scientistId, event);
}

/**
 * The scientist after one event.
 * @param scientist - scientist before
 * @param event - the event
 * @returns scientist after
 */
function advance(scientist: Scientist, event: WorldEvent): Scientist {
  switch (event.kind) {
    case 'thinking':
      return { ...scientist, status: scientist.current ? scientist.status : 'thinking' };
    case 'text':
      return event.final
        ? { ...scientist, status: 'done', current: null, report: event.text, lastText: event.text }
        : { ...scientist, status: scientist.current ? scientist.status : 'thinking', lastText: event.text };
    case 'tool': {
      const action: ActionEntry = { at: event.at, toolUseId: event.toolUseId, tool: event.tool, summary: event.summary, state: 'running' };
      return {
        ...scientist,
        status: statusForTool(event.tool),
        current: { toolUseId: event.toolUseId, tool: event.tool, summary: event.summary, since: event.at },
        actions: capped([...scientist.actions, action], MAX_ACTIONS),
      };
    }
    case 'toolResult':
      return finishAction(scientist, event.toolUseId, event.isError);
    case 'interrupt':
      return { ...scientist, status: 'interrupted', current: null };
    case 'meta':
      return { ...scientist, model: event.model ?? scientist.model, effort: event.effort ?? scientist.effort };
    default:
      return scientist;
  }
}

/**
 * Mark an action finished and move `current` to the newest call still running, if any.
 * @param scientist - scientist before
 * @param toolUseId - the finished call
 * @param isError - whether it failed
 * @returns scientist after
 */
function finishAction(scientist: Scientist, toolUseId: string, isError: boolean): Scientist {
  const actions = scientist.actions.map((action): ActionEntry => (action.toolUseId === toolUseId ? { ...action, state: isError ? 'error' : 'ok' } : action));
  if (scientist.current?.toolUseId !== toolUseId) return { ...scientist, actions };
  const running = [...actions].reverse().find((action) => action.state === 'running');
  if (!running) return { ...scientist, actions, current: null, status: 'thinking' };
  return {
    ...scientist,
    actions,
    status: statusForTool(running.tool),
    current: { toolUseId: running.toolUseId, tool: running.tool, summary: running.summary, since: running.at },
  };
}

/**
 * Remember Agent calls and the agent ids they produced, so subagents land in the right lab.
 * @param session - current session
 * @param labId - lab of the event
 * @param scientistId - scientist that made the call
 * @param event - the event
 * @returns the new session
 */
function trackSpawns(session: Session, labId: string, scientistId: string, event: WorldEvent): Session {
  if (event.kind === 'tool' && event.spawn) {
    return { ...session, pendingSpawns: { ...session.pendingSpawns, [event.toolUseId]: { labId, parentId: scientistId, spawn: event.spawn } } };
  }
  if (event.kind === 'toolResult' && event.agentId) {
    const spawnLab = session.pendingSpawns[event.toolUseId]?.labId ?? labId;
    return { ...session, agentLabs: { ...session.agentLabs, [event.agentId]: spawnLab } };
  }
  return session;
}

/**
 * The status a pending call puts a scientist in.
 * @param tool - tool name
 * @returns status
 */
function statusForTool(tool: string): ScientistStatus {
  return tool === 'AskUserQuestion' ? 'asking' : 'working';
}

/**
 * A scientist that has just arrived in a lab and is thinking.
 * @param init - identity and arrival time
 * @returns scientist
 */
function newScientist(init: {
  id: string;
  role: string;
  description: string;
  instruction: string;
  parentId: string | null;
  depth: number;
  model?: string;
  effort?: string;
  at: string;
}): Scientist {
  const { at, model = '', effort = '', ...identity } = init;
  return { ...identity, model, effort, status: 'thinking', current: null, actions: [], report: '', lastText: '', startedAt: at, updatedAt: at };
}

/**
 * Replace a lab in the session by id.
 * @param session - current session
 * @param lab - the updated lab
 * @returns the new session
 */
function replaceLab(session: Session, lab: Lab): Session {
  return { ...session, labs: session.labs.map((candidate) => (candidate.id === lab.id ? lab : candidate)) };
}

/**
 * Add a timeline entry in time order. Subagent transcripts are read after the main one, so their
 * entries can be older than entries already present; replay relies on the order.
 * @param timeline - entries, oldest first
 * @param entry - the new entry
 * @returns the new timeline, capped
 */
function insertByTime(timeline: TimelineEntry[], entry: TimelineEntry): TimelineEntry[] {
  const time = Date.parse(entry.at);
  let index = timeline.length;
  while (index > 0 && Date.parse(timeline[index - 1]?.at ?? '') > time) index -= 1;
  return capped([...timeline.slice(0, index), entry, ...timeline.slice(index)], MAX_TIMELINE);
}

/**
 * A change with its before and after text cut to a bounded size.
 * @param change - the change as the tool call made it
 * @returns the change, marked truncated when cut
 */
function boundedChange(change: FileChange): FileChange & { truncated?: boolean } {
  if (change.oldText.length <= MAX_CHANGE_TEXT && change.newText.length <= MAX_CHANGE_TEXT) return change;
  return { ...change, oldText: change.oldText.slice(0, MAX_CHANGE_TEXT), newText: change.newText.slice(0, MAX_CHANGE_TEXT), truncated: true };
}

/**
 * Keep the newest `max` items.
 * @param items - items, oldest first
 * @param max - limit
 * @returns the newest items
 */
function capped<T>(items: T[], max: number): T[] {
  return items.length > max ? items.slice(items.length - max) : items;
}
