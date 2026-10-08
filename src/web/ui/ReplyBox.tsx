import { useState, type FormEvent, type ReactElement } from 'react';
import { sendControl, type ControlAccess } from '../state/control';
import { Icon } from './icons';

/** Permission modes a reply may run in, as a person would say them. */
const MODES = { default: 'Ask before risky actions', acceptEdits: 'Accept file edits', plan: 'Plan only' } as const;

/**
 * "Reply to this session": sends a follow-up that runs on a copy of the session, so the session open
 * in your editor or terminal is never written into. The copy appears as its own island.
 * @param props - access and the session to reply to
 * @returns the reply box
 */
export function ReplyBox({ access, sessionId }: { access: ControlAccess; sessionId: string }): ReactElement {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<keyof typeof MODES>('default');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' } | { kind: 'done' | 'error'; text: string }>({ kind: 'idle' });

  const send = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    setState({ kind: 'sending' });
    const reply = await sendControl<unknown>(access, '/api/runs', { sessionId, prompt, permissionMode: mode });
    if (!reply.ok) return setState({ kind: 'error', text: reply.error });
    setPrompt('');
    setState({ kind: 'done', text: 'Sent. A copy of this session is working on it and will rise as its own island.' });
  };

  return (
    <form className="reply" onSubmit={(event) => void send(event)}>
      <label className="field">
        <span className="field__label">Reply to this session</span>
        <textarea
          className="field__input"
          rows={3}
          value={prompt}
          placeholder="Runs on a copy; your open session is not changed"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void send();
          }}
        />
      </label>
      <div className="reply__actions">
        <select className="field__input reply__mode" aria-label="Permissions" value={mode} onChange={(event) => setMode(event.target.value as keyof typeof MODES)}>
          {(Object.keys(MODES) as Array<keyof typeof MODES>).map((key) => (
            <option key={key} value={key}>
              {MODES[key]}
            </option>
          ))}
        </select>
        <button type="submit" className="button button--primary" disabled={state.kind === 'sending' || !prompt.trim()}>
          <Icon name="command" />
          {state.kind === 'sending' ? 'Sending…' : 'Send reply'}
        </button>
      </div>
      {(state.kind === 'done' || state.kind === 'error') && (
        <p className={`notice-inline notice-inline--${state.kind}`} role="status">
          {state.text}
        </p>
      )}
    </form>
  );
}
