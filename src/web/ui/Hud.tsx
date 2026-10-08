import type { ReactElement } from 'react';
import type { SessionSummary, WorldSummary } from '../../shared/types';
import { isWaiting } from '../scene/layout';
import { clientLabel, preview } from './format';
import { Icon } from './icons';

/** Props for the heads-up display. */
interface HudProps {
  world: WorldSummary | null;
  connected: boolean;
  now: number;
  focusedSessionId: string | null;
  onFocusContinent: (sessionId: string) => void;
  onOverview: () => void;
  onCommand: () => void;
  waitingOnYou: number;
}

/** World-level counts shown in the top bar. */
export interface WorldStats {
  sessions: number;
  busy: number;
  asking: number;
  waiting: number;
  labs: number;
  edits: number;
}

/**
 * Count what is happening across the whole world.
 * @param world - world summary
 * @param now - current time, epoch milliseconds
 * @returns counts
 */
export function worldStats(world: WorldSummary, now: number): WorldStats {
  const scientists = world.sessions.flatMap((session) => session.labs.flatMap((lab) => lab.scientists));
  return {
    sessions: world.sessions.length,
    busy: scientists.filter((scientist) => scientist.status === 'thinking' || scientist.status === 'working').length,
    asking: scientists.filter((scientist) => scientist.status === 'asking').length,
    waiting: scientists.filter((scientist) => isWaiting(scientist, now)).length,
    labs: world.sessions.reduce((total, session) => total + session.labs.length, 0),
    edits: world.sessions.reduce((total, session) => total + session.labs.reduce((sum, lab) => sum + lab.changeCount, 0), 0),
  };
}

/**
 * Top bar with world counts and connection state, and a list of continents to fly to.
 * @param props - world, connection and handlers
 * @returns the HUD
 */
export function Hud({ world, connected, now, focusedSessionId, onFocusContinent, onOverview, onCommand, waitingOnYou }: HudProps): ReactElement {
  const stats = world ? worldStats(world, now) : null;
  return (
    <>
      <header className="hud">
        <button type="button" className="hud__title" onClick={onOverview}>
          <Icon name="logo" className="hud__logo" />
          Agent World
        </button>
        {stats && (
          <ul className="hud__stats" aria-label="World activity">
            <Metric value={stats.sessions} noun="session" />
            <Metric value={stats.busy} noun="busy" fixed />
            <Metric value={stats.labs} noun="lab" />
            <Metric value={stats.edits} noun="edit" />
          </ul>
        )}
        {stats && (stats.asking > 0 || stats.waiting > 0) && (
          <div className="hud__alerts">
            {stats.asking > 0 && (
              <span className="hud__chip hud__chip--asking">
                <span className="status-dot status-dot--asking" aria-hidden="true" />
                {stats.asking} asking you
              </span>
            )}
            {stats.waiting > 0 && (
              <span className="hud__chip hud__stuck" title="A tool call has been pending over 20 seconds: a permission prompt or a long command">
                <Icon name="alert" />
                {stats.waiting} stuck over 20s
              </span>
            )}
          </div>
        )}
        <p className="hud__live" role="status">
          <span className={`status-dot${connected ? ' status-dot--done' : ''}`} aria-hidden="true" />
          {connected ? 'Live' : 'Reconnecting…'}
        </p>
        <button type="button" className="hud__command" onClick={onCommand}>
          <Icon name="command" />
          Command centre
          {waitingOnYou > 0 && <span className="hud__badge">{waitingOnYou}</span>}
        </button>
      </header>
      {world && world.sessions.length > 0 && (
        <nav className="continents" aria-label="Sessions">
          {world.sessions.map((session) => (
            <ContinentButton
              key={session.sessionId}
              session={session}
              active={session.sessionId === focusedSessionId}
              onClick={() => onFocusContinent(session.sessionId)}
            />
          ))}
        </nav>
      )}
    </>
  );
}

/**
 * One continent in the session list.
 * @param props - session, whether focused, click handler
 * @returns the button
 */
function ContinentButton({ session, active, onClick }: { session: SessionSummary; active: boolean; onClick: () => void }): ReactElement {
  const busy = session.labs.some((lab) => lab.active);
  return (
    <button type="button" className={`continent-chip${active ? ' continent-chip--active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className={`continent-chip__lamp${busy ? ' continent-chip__lamp--lit' : ''}`} aria-hidden="true" />
      <span className="continent-chip__name">{session.title ? preview(session.title, 34) : session.project}</span>
      <span className="continent-chip__meta">
        {session.title ? `${session.project}, ` : ''}
        {clientLabel(session.entrypoint)}, {plural(session.labs.length, 'lab')}
      </span>
    </button>
  );
}

/**
 * One labelled number in the top bar. The value and label read as "3 labs" to tests and screen
 * readers, while the label is drawn small beneath the value.
 * @param props - the count, its noun, and whether the noun never takes a plural
 * @returns the list item
 */
function Metric({ value, noun, fixed = false }: { value: number; noun: string; fixed?: boolean }): ReactElement {
  return (
    <li className="hud__metric">
      <span className="hud__metric-value">{value}</span>{' '}
      <span className="hud__metric-label">{fixed || value === 1 ? noun : `${noun}s`}</span>
    </li>
  );
}

/**
 * A count with its noun in the right number.
 * @param count - count
 * @param noun - singular noun
 * @returns e.g. "3 labs"
 */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
