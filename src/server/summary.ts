import type { Lab, LabSummary, Scientist, ScientistStatus, ScientistSummary, Session, WorldSummary } from '../shared/types.js';

/** A busy scientist silent for this long is shown as idle (its process likely stopped). */
export const STALE_AFTER_MS = 15 * 60 * 1000;
/** Characters of a prompt sent in the summary; the full prompt comes with the lab detail. */
export const PROMPT_PREVIEW = 280;

const BUSY: ReadonlySet<ScientistStatus> = new Set(['thinking', 'working', 'asking']);

/**
 * The light world view streamed to the browser: no action feeds, diffs or timelines.
 * @param sessions - live sessions
 * @param now - current time, epoch milliseconds
 * @returns world summary
 */
export function summarizeWorld(sessions: Session[], now: number): WorldSummary {
  return {
    generatedAt: new Date(now).toISOString(),
    sessions: [...sessions]
      .sort((left, right) => left.startedAt - right.startedAt)
      .map((session) => ({
        sessionId: session.sessionId,
        pid: session.pid,
        cwd: session.cwd,
        project: session.project,
        branch: session.branch,
        title: session.title,
        kind: session.kind,
        entrypoint: session.entrypoint,
        startedAt: session.startedAt,
        labs: session.labs.map((lab) => summarizeLab(lab, now)),
      })),
  };
}

/**
 * One lab's summary.
 * @param lab - lab
 * @param now - current time, epoch milliseconds
 * @returns lab summary
 */
function summarizeLab(lab: Lab, now: number): LabSummary {
  const scientists = Object.values(lab.scientists).map((scientist) => summarizeScientist(scientist, lab, now));
  return {
    id: lab.id,
    index: lab.index,
    prompt: lab.prompt.length > PROMPT_PREVIEW ? `${lab.prompt.slice(0, PROMPT_PREVIEW)}…` : lab.prompt,
    startedAt: lab.startedAt,
    updatedAt: lab.updatedAt,
    active: scientists.some((scientist) => BUSY.has(scientist.status)),
    changeCount: lab.changes.length,
    scientists,
    version: lab.version,
  };
}

/**
 * One scientist's summary, with long-silent busy scientists shown as idle.
 * @param scientist - scientist
 * @param lab - its lab
 * @param now - current time, epoch milliseconds
 * @returns scientist summary
 */
function summarizeScientist(scientist: Scientist, lab: Lab, now: number): ScientistSummary {
  const stale = BUSY.has(scientist.status) && now - Date.parse(scientist.updatedAt) > STALE_AFTER_MS;
  return {
    id: scientist.id,
    role: scientist.role,
    description: scientist.description,
    status: stale ? 'idle' : scientist.status,
    current: stale ? null : scientist.current,
    parentId: scientist.parentId,
    depth: scientist.depth,
    model: scientist.model,
    effort: scientist.effort,
    changeCount: lab.changes.filter((change) => change.scientistId === scientist.id).length,
    updatedAt: scientist.updatedAt,
  };
}
