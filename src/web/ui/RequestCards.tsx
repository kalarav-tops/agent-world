import type { ReactElement } from 'react';
import type { PendingRequest, SessionSummary } from '../../shared/types';
import type { ControlAccess } from '../state/control';
import { preview } from './format';
import { RequestForm } from './RequestForm';

/** Props for the request cards. */
interface RequestCardsProps {
  access: ControlAccess;
  requests: PendingRequest[];
  sessions: SessionSummary[];
  now: number;
}

/**
 * Questions and permission prompts that agents are waiting on, answered right here. Each card shows
 * how long is left before the normal dialog appears in the session instead.
 * @param props - access, open requests, sessions and the clock
 * @returns the cards, or nothing when no agent is waiting
 */
export function RequestCards({ access, requests, sessions, now }: RequestCardsProps): ReactElement | null {
  if (!requests.length) return null;
  return (
    <section className="requests" aria-label="Agents waiting on you">
      {requests.map((request) => {
        const session = sessions.find((entry) => entry.sessionId === request.sessionId);
        return <RequestForm key={request.id} access={access} request={request} sessionName={session ? preview(session.title || session.project, 40) : 'A session'} now={now} />;
      })}
    </section>
  );
}
