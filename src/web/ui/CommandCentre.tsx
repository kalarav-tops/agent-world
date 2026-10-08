import { useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import type { ControlRun, SessionSummary } from '../../shared/types';
import { sendControl, type ControlAccess } from '../state/control';
import { preview, timeAgo } from './format';
import { Icon } from './icons';

/** Props for the command centre drawer. */
interface CommandCentreProps {
  access: ControlAccess;
  sessions: SessionSummary[];
  runs: ControlRun[];
  now: number;
  defaultSessionId: string | null;
  onClose: () => void;
}

type RunMode = 'continue' | 'new';
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
  const [mode, setMode] = useState<RunMode>('continue');
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
    const reply = await sendControl<ControlRun>(access, '/api/runs', { sessionId, prompt, permissionMode: permission, mode });
    setSending(false);
    if (!reply.ok) {
      setNotice({ kind: 'error', text: reply.error });
      return;
    }
    setPrompt('');
    setNotice({
      kind: 'done',
      text: mode === 'continue' ? 'Sent. A copy of the session is working on it and will appear as its own continent.' : 'Started. The new task will appear as its own continent.',
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
            <fieldset className="field">
              <legend className="field__label">What to do</legend>
              <label className="choice">
                <input type="radio" name="mode" checked={mode === 'continue'} onChange={() => setMode('continue')} />
                <span>
                  Continue this session's work
                  <small>Runs on a copy with the full conversation; your open session is not changed.</small>
                </span>
              </label>
              <label className="choice">
                <input type="radio" name="mode" checked={mode === 'new'} onChange={() => setMode('new')} />
                <span>
                  Start a new task in {target?.project ?? 'this project'}
                  <small>A fresh session in the same folder.</small>
                </span>
              </label>
            </fieldset>
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
                  <span className="run__prompt">{preview(run.prompt, 70)}</span>
                  <span className="run__meta">
                    {run.sessionId ? 'Continued session' : 'New task'}, {timeAgo(run.startedAt, now)}
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
function runStateLabel(run: ControlRun): string {
  if (run.state === 'running') return 'Running';
  if (run.state === 'finished') return 'Finished';
  return run.exitCode === null ? 'Failed' : `Failed (exit ${run.exitCode})`;
}
