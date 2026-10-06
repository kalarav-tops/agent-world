import type { ReactElement, ReactNode } from 'react';
import type { ChangeEntry, Lab, LabSummary, Scientist, ScientistSummary, SessionSummary } from '../../shared/types';
import { baseName } from '../../shared/tools';
import { isWaiting, STATUS_COLORS } from '../scene/layout';
import { DiffView } from './DiffView';
import { ExplainButton } from './ExplainButton';
import type { ControlAccess } from '../state/control';
import { agentCount, preview, roleLabel, statusLabel, timeAgo } from './format';

/** What the panel shows. */
export type PanelView = { kind: 'lab' } | { kind: 'changes'; changeIndex: number | null } | { kind: 'scientist'; scientistId: string };

/** Props for the side panel. */
interface InspectPanelProps {
  session: SessionSummary;
  lab: LabSummary;
  detail: Lab | null;
  view: PanelView;
  now: number;
  replayBar: ReactNode;
  access: ControlAccess;
  onView: (view: PanelView) => void;
  onClose: () => void;
}

/**
 * The side panel for a selected lab: its prompt, scientists, changes board and replay, or one
 * scientist's instruction, activity and report.
 * @param props - selection, data and handlers
 * @returns the panel
 */
export function InspectPanel(props: InspectPanelProps): ReactElement {
  const { session, lab, view, onClose } = props;
  return (
    <aside className="panel" aria-label={`Lab ${lab.index} details`}>
      <header className="panel__header">
        <div>
          <h2 className="panel__title">Lab {lab.index}</h2>
          <p className="panel__meta">
            {session.title || session.project}, started {timeAgo(lab.startedAt, props.now)}, {agentCount(lab.scientists)}
          </p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </header>
      <div className="panel__body">
        {view.kind === 'lab' && <LabView {...props} />}
        {view.kind === 'changes' && <ChangesView {...props} changeIndex={view.changeIndex} />}
        {view.kind === 'scientist' && <ScientistView {...props} scientistId={view.scientistId} />}
      </div>
      <footer className="panel__footer">{props.replayBar}</footer>
    </aside>
  );
}

/**
 * Lab overview: the prompt, the scientists and a link to the changes board.
 * @param props - panel props
 * @returns view
 */
function LabView({ session, lab, detail, now, onView, access }: InspectPanelProps): ReactElement {
  const prompt = detail?.prompt ?? lab.prompt;
  return (
    <>
      <section className="section">
        <h3 className="section__title">Prompt</h3>
        <blockquote className="prompt">{prompt || 'This prompt had no text.'}</blockquote>
      </section>
      <section className="section">
        <h3 className="section__title">What this lab did</h3>
        <ExplainButton access={access} sessionId={session.sessionId} labId={lab.id} label="Ask the session what this lab did" />
      </section>
      <section className="section">
        <h3 className="section__title">Scientists</h3>
        <ul className="list">
          {lab.scientists.map((scientist) => (
            <li key={scientist.id}>
              <ScientistRow scientist={scientist} now={now} onClick={() => onView({ kind: 'scientist', scientistId: scientist.id })} />
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <h3 className="section__title">Changes</h3>
        {lab.changeCount ? (
          <button type="button" className="row" onClick={() => onView({ kind: 'changes', changeIndex: null })}>
            <span className="row__main">{lab.changeCount === 1 ? '1 file change' : `${lab.changeCount} file changes`}</span>
            <span className="row__sub">Open the changes board</span>
          </button>
        ) : (
          <p className="muted">No files changed in this lab.</p>
        )}
      </section>
    </>
  );
}

/**
 * The changes board: every edit and write in the lab, and the diff of the one picked.
 * @param props - panel props plus the picked change
 * @returns view
 */
function ChangesView({ lab, detail, onView, changeIndex }: InspectPanelProps & { changeIndex: number | null }): ReactElement {
  const back = (
    <button type="button" className="text-button" onClick={() => onView(changeIndex === null ? { kind: 'lab' } : { kind: 'changes', changeIndex: null })}>
      {changeIndex === null ? 'Back to lab' : 'Back to changes'}
    </button>
  );
  if (!detail) return <Loading>{back}</Loading>;
  const picked = changeIndex === null ? undefined : detail.changes[changeIndex];
  if (picked) {
    return (
      <section className="section">
        {back}
        <h3 className="section__title section__title--file">{baseName(picked.file)}</h3>
        <p className="muted break">{picked.file}</p>
        <DiffView change={picked} />
      </section>
    );
  }
  return (
    <section className="section">
      {back}
      <h3 className="section__title">Changes board</h3>
      <ul className="list">
        {[...detail.changes.entries()].reverse().map(([index, change]) => (
          <li key={`${change.toolUseId}-${index}`}>
            <ChangeRow change={change} by={lab.scientists.find((scientist) => scientist.id === change.scientistId)} onClick={() => onView({ kind: 'changes', changeIndex: index })} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One scientist's details: what it was asked, what it did, and what it reported.
 * @param props - panel props plus the scientist id
 * @returns view
 */
function ScientistView({ session, lab, detail, now, onView, scientistId, access }: InspectPanelProps & { scientistId: string }): ReactElement {
  const summary = lab.scientists.find((scientist) => scientist.id === scientistId);
  const full: Scientist | undefined = detail?.scientists[scientistId];
  const back = (
    <button type="button" className="text-button" onClick={() => onView({ kind: 'lab' })}>
      Back to lab
    </button>
  );
  if (!summary) return <p className="muted">This scientist has left the lab.</p>;
  const waiting = isWaiting(summary, now);
  return (
    <>
      <section className="section">
        {back}
        <h3 className="scientist-name">{roleLabel(summary.role)}</h3>
        {summary.description && <p className="muted">{summary.description}</p>}
        <p className="status-line">
          <span className="dot" style={{ background: STATUS_COLORS[summary.status] }} />
          {statusLabel(summary.status, waiting)}
          {summary.current ? `: ${summary.current.summary}` : ''}
        </p>
      </section>
      <section className="section">
        <h3 className="section__title">What this agent did</h3>
        <ExplainButton access={access} sessionId={session.sessionId} labId={lab.id} scientistId={scientistId} label="Ask the session what this agent did" />
      </section>
      {!full ? (
        <Loading />
      ) : (
        <>
          <section className="section">
            <h3 className="section__title">{summary.role === 'main' ? 'Prompt it got' : 'Instruction it got'}</h3>
            <blockquote className="prompt">{full.instruction || 'No instruction recorded.'}</blockquote>
          </section>
          <section className="section">
            <h3 className="section__title">Activity</h3>
            {full.actions.length ? (
              <ol className="feed" reversed>
                {[...full.actions].reverse().map((action) => (
                  <li key={action.toolUseId} className={`feed__item feed__item--${action.state}`}>
                    <span className="feed__tool">{action.tool}</span>
                    <span className="feed__summary">{action.summary}</span>
                    <span className="feed__time">{timeAgo(action.at, now)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">No tool calls yet.</p>
            )}
          </section>
          <section className="section">
            <h3 className="section__title">{full.report ? 'Report' : 'Latest message'}</h3>
            <p className="report">{full.report || full.lastText || 'Nothing written yet.'}</p>
          </section>
        </>
      )}
    </>
  );
}

/**
 * A scientist in the lab list.
 * @param props - scientist, time, click handler
 * @returns row button
 */
function ScientistRow({ scientist, now, onClick }: { scientist: ScientistSummary; now: number; onClick: () => void }): ReactElement {
  const waiting = isWaiting(scientist, now);
  return (
    <button type="button" className="row" onClick={onClick} style={{ paddingLeft: `${0.75 + scientist.depth * 0.9}rem` }}>
      <span className="row__main">
        <span className="dot" style={{ background: STATUS_COLORS[scientist.status] }} />
        {roleLabel(scientist.role)}
        {scientist.description && <span className="row__aside"> {preview(scientist.description, 40)}</span>}
      </span>
      <span className="row__sub">
        {statusLabel(scientist.status, waiting)}
        {scientist.current ? `: ${preview(scientist.current.summary, 50)}` : ''}
      </span>
    </button>
  );
}

/**
 * A change on the changes board.
 * @param props - change, its author, click handler
 * @returns row button
 */
function ChangeRow({ change, by, onClick }: { change: ChangeEntry; by: ScientistSummary | undefined; onClick: () => void }): ReactElement {
  return (
    <button type="button" className="row" onClick={onClick}>
      <span className="row__main">{baseName(change.file)}</span>
      <span className="row__sub">
        {change.op === 'write' ? 'Wrote file' : 'Edited'} by {by ? roleLabel(by.role) : 'a scientist'}
      </span>
    </button>
  );
}

/**
 * Placeholder while lab detail loads.
 * @param props - optional content shown above the message
 * @returns loading note
 */
function Loading({ children }: { children?: ReactNode }): ReactElement {
  return (
    <section className="section">
      {children}
      <p className="muted">Loading lab notes…</p>
    </section>
  );
}
