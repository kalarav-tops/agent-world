import type { ReactElement, ReactNode } from 'react';
import type { ChangeEntry, Lab, LabSummary, Scientist, ScientistSummary, SessionSummary } from '../../shared/types';
import { baseName } from '../../shared/tools';
import { isWaiting, STATUS_COLORS } from '../scene/layout';
import { DiffView } from './DiffView';
import { ExplainButton } from './ExplainButton';
import type { ControlAccess } from '../state/control';
import { agentCount, preview, roleLabel, statusLabel, timeAgo } from './format';
import { effortLabel, modelLabel } from '../../shared/models';
import { Icon } from './icons';

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
  const { session, lab, view, onClose, onView } = props;
  const back = backTarget(view);
  const scientist = view.kind === 'scientist' ? lab.scientists.find((candidate) => candidate.id === view.scientistId) : undefined;
  const trail = [session.title ? preview(session.title, 32) : session.project, `Lab ${lab.index}`];
  if (view.kind === 'changes') trail.push('Changes');
  if (scientist) trail.push(roleLabel(scientist.role));
  return (
    <aside className="panel" aria-label={`Lab ${lab.index} details`}>
      <header className="panel__header">
        {back && (
          <button type="button" className="icon-button" onClick={() => onView(back.view)} aria-label={back.label} title={back.label}>
            <Icon name="back" />
          </button>
        )}
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <ol>
            {trail.map((step, index) => (
              <li key={index} aria-current={index === trail.length - 1 ? 'page' : undefined}>
                {step}
              </li>
            ))}
          </ol>
        </nav>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close panel" title="Close (Esc)">
          <Icon name="close" />
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
      <h2 className="panel__title">Lab {lab.index}</h2>
      <dl className="facts">
        <dt>Session</dt>
        <dd>{session.title || session.project}</dd>
        <dt>Project</dt>
        <dd className="mono">{session.project}</dd>
        <dt>Started</dt>
        <dd>{timeAgo(lab.startedAt, now)}</dd>
        <dt>Agents</dt>
        <dd>{agentCount(lab.scientists)}</dd>
      </dl>
      <section className="section">
        <h3 className="section__title">Prompt</h3>
        <blockquote className="prompt">{prompt || 'This prompt had no text.'}</blockquote>
      </section>
      <section className="section">
        <h3 className="section__title">What this lab did</h3>
        <ExplainButton access={access} sessionId={session.sessionId} labId={lab.id} label="Ask the session what this lab did" />
      </section>
      <section className="section">
        <h3 className="section__title">Agents</h3>
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
          <button type="button" className="row row--link" onClick={() => onView({ kind: 'changes', changeIndex: null })}>
            <span className="row__main">
              <Icon name="file" />
              {lab.changeCount === 1 ? '1 file change' : `${lab.changeCount} file changes`}
            </span>
            <span className="row__sub">Open the changes board</span>
            <Icon name="chevron" className="row__chevron" />
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
  if (!detail) return <Loading />;
  const picked = changeIndex === null ? undefined : detail.changes[changeIndex];
  if (picked) {
    return (
      <section className="section">
        <h2 className="panel__title mono">{baseName(picked.file)}</h2>
        <p className="muted break mono">{picked.file}</p>
        <DiffView change={picked} />
      </section>
    );
  }
  return (
    <section className="section">
      <h2 className="panel__title">Changes board</h2>
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
function ScientistView({ session, lab, detail, now, scientistId, access }: InspectPanelProps & { scientistId: string }): ReactElement {
  const summary = lab.scientists.find((scientist) => scientist.id === scientistId);
  const full: Scientist | undefined = detail?.scientists[scientistId];
  if (!summary) return <p className="muted">This agent has left the lab.</p>;
  const waiting = isWaiting(summary, now);
  return (
    <>
      <h2 className="panel__title">{roleLabel(summary.role)}</h2>
      {summary.description && <p className="muted">{summary.description}</p>}
      <p className="status-line">
        <span className="dot" style={{ background: STATUS_COLORS[summary.status] }} />
        {statusLabel(summary.status, waiting)}
        {summary.current ? `: ${summary.current.summary}` : ''}
      </p>
      <dl className="facts">
        <dt>Model</dt>
        <dd>{modelLabel(summary.model) || 'Unknown'}</dd>
        <dt>Effort</dt>
        <dd>{effortLabel(summary.effort) || 'Unknown'}</dd>
        <dt>Edits</dt>
        <dd className="num">{summary.changeCount}</dd>
      </dl>
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
              <table className="activity">
                <thead>
                  <tr>
                    <th scope="col">Tool</th>
                    <th scope="col">Action</th>
                    <th scope="col" className="activity__when">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...full.actions].reverse().map((action) => (
                    <tr key={action.toolUseId} className={`activity__row activity__row--${action.state}`}>
                      <td className="activity__tool">{action.tool}</td>
                      <td className="activity__summary">{action.summary}</td>
                      <td className="activity__when">{timeAgo(action.at, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
      <span className="row__model">{modelEffort(scientist)}</span>
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
      <span className="row__main mono">{baseName(change.file)}</span>
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
function Loading(): ReactElement {
  return (
    <section className="section">
      <p className="muted">Loading lab notes…</p>
    </section>
  );
}

/**
 * Where the header's back button goes from a view, and its name.
 * @param view - the current view
 * @returns the view to go back to and the button name, or null on the lab overview
 */
function backTarget(view: PanelView): { view: PanelView; label: string } | null {
  if (view.kind === 'lab') return null;
  if (view.kind === 'changes' && view.changeIndex !== null) return { view: { kind: 'changes', changeIndex: null }, label: 'Back to changes' };
  return { view: { kind: 'lab' }, label: 'Back to lab' };
}

/**
 * An agent's model and effort, for example "Opus 5.5 · High".
 * @param scientist - the agent
 * @returns the label, empty when neither is known
 */
function modelEffort(scientist: ScientistSummary): string {
  return [modelLabel(scientist.model), effortLabel(scientist.effort)].filter(Boolean).join(' · ');
}
