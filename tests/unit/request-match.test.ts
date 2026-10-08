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
