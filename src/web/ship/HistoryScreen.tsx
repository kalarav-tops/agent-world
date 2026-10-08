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
                    {run.kind === 'reply' ? 'Reply · ' : ''}
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
