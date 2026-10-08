import { useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import type { SessionSummary, ShipLogEntry } from '../../shared/types';
import { sendControl, type ControlAccess } from '../state/control';
import { preview, timeAgo } from './format';
import { Icon } from './icons';

/** Props for the command centre drawer. */
interface CommandCentreProps {
  access: ControlAccess;
  sessions: SessionSummary[];
  runs: ShipLogEntry[];
  now: number;
  defaultSessionId: string | null;
  onClose: () => void;
}

type PermissionMode = 'default' | 'acceptEdits' | 'plan';

const PERMISSION_LABELS: Record<PermissionMode, string> = {
  default: 'Ask before risky actions',
  acceptEdits: 'Accept file edits',
  plan: 'Plan only, change nothing',
};

/**
 * The command centre: send a prompt to continue a session (on a copy, so the open session is never
 * written into) or to start a new task in a session's project, and follow the runs you started.
 * @param props - access, sessions, runs and handlers
 * @returns the drawer
 */
export function CommandCentre({ access, sessions, runs, now, defaultSessionId, onClose }: CommandCentreProps): ReactElement {
  const [sessionId, setSessionId] = useState(defaultSessionId ?? sessions[0]?.sessionId ?? '');
  const [permission, setPermission] = useState<PermissionMode>('default');
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'done'; text: string } | null>(null);
  const target = sessions.find((session) => session.sessionId === sessionId);

  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    if (!target || sending) return;
    setSending(true);
    setNotice(null);
    const reply = await sendControl<ShipLogEntry>(access, '/api/runs', { sessionId, prompt, permissionMode: permission });
    setSending(false);
    if (!reply.ok) {
      setNotice({ kind: 'error', text: reply.error });
      return;
    }
    setPrompt('');
    setNotice({
      kind: 'done',
      text: 'Sent. A copy of the session is working on it and will appear as its own continent.',
    });
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void submit();
  };

  return (
    <aside className="command" aria-label="Command centre">
      <header className="panel__header">
        <div className="panel__heading">
          <h2 className="panel__title">Command centre</h2>
          <p className="panel__meta">Send work to your sessions from the world</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close command centre" title="Close">
          <Icon name="close" />
        </button>
      </header>
      <div className="panel__body">
        {!access.enabled ? (
          <section className="section">
            <p className="muted">
              The command centre is off, so Agent World only watches. To send prompts, ask agents what they did and answer their questions here, restart it with:
            </p>
            <pre className="command__code">npm start -- --allow-control</pre>
            <p className="muted">To answer agent questions and permission prompts from the world as well, add the hook it prints with:</p>
            <pre className="command__code">node dist/server/cli.js hooks</pre>
          </section>
        ) : (
          <form className="command__form" onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span className="field__label">Session</span>
              <select className="field__input" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
                {sessions.map((session) => (
                  <option key={session.sessionId} value={session.sessionId}>
                    {preview(session.title || session.project, 60)} ({session.project})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Permissions</span>
              <select className="field__input" value={permission} onChange={(event) => setPermission(event.target.value as PermissionMode)}>
                {(Object.keys(PERMISSION_LABELS) as PermissionMode[]).map((key) => (
                  <option key={key} value={key}>
                    {PERMISSION_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Prompt</span>
              <textarea
                className="field__input field__input--prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={onKey}
                placeholder="Describe the work, as you would in Claude Code"
                rows={6}
              />
              <small className="muted">Ctrl+Enter sends. Slash commands only work typed in the session itself. Runs use your Claude usage.</small>
            </label>
            <button type="submit" className="button button--primary" disabled={sending || !prompt.trim() || !target}>
              {sending ? 'Sending…' : 'Send prompt'}
            </button>
            {notice && (
              <p className={`notice-inline notice-inline--${notice.kind}`} role="status">
                {notice.text}
              </p>
            )}
          </form>
        )}
        {runs.length > 0 && (
          <section className="section">
            <h3 className="section__title">Your runs</h3>
            <ul className="list">
              {runs.map((run) => (
                <li key={run.id} className="run">
                  <span className={`run__state run__state--${run.state}`}>{runStateLabel(run)}</span>
                  <span className="run__prompt">{preview(run.promptPreview, 70)}</span>
                  <span className="run__meta">
                    {run.kind === 'reply' ? 'Reply' : 'New conversation'}, {timeAgo(run.startedAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}

/**
 * A run's state in words.
 * @param run - the run
 * @returns label
 */
function runStateLabel(run: ShipLogEntry): string {
  if (run.state === 'running') return 'Running';
  if (run.state === 'finished') return 'Finished';
  return run.exitCode === null ? 'Failed' : `Failed (exit ${run.exitCode})`;
}
