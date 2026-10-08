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
