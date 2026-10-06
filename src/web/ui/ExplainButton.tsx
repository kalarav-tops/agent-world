import { useEffect, useState, type ReactElement } from 'react';
import { sendControl, type ControlAccess } from '../state/control';

/** Props for asking a session about a lab's or an agent's work. */
interface ExplainButtonProps {
  access: ControlAccess;
  sessionId: string;
  labId: string;
  scientistId?: string;
  label: string;
}

/**
 * Asks the session to explain a lab's (or one agent's) work: an explanation, an example, and what it
 * fixed or worked on. It runs on a throwaway copy of the session, so nothing is added to it.
 * @param props - access, what to ask about, and the button label
 * @returns the button and the answer
 */
export function ExplainButton({ access, sessionId, labId, scientistId, label }: ExplainButtonProps): ReactElement {
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'asking' } | { kind: 'answer'; text: string } | { kind: 'error'; text: string }>({ kind: 'idle' });

  useEffect(() => setState({ kind: 'idle' }), [sessionId, labId, scientistId]);

  const ask = async (): Promise<void> => {
    setState({ kind: 'asking' });
    const reply = await sendControl<string>(access, '/api/explanations', { sessionId, labId, ...(scientistId ? { scientistId } : {}) });
    setState(reply.ok ? { kind: 'answer', text: reply.result } : { kind: 'error', text: reply.error });
  };

  if (!access.enabled) {
    return <p className="muted">Turn on the command centre (start with --allow-control) to ask the session what this did.</p>;
  }
  return (
    <div className="explain">
      <button type="button" className="button" onClick={() => void ask()} disabled={state.kind === 'asking'}>
        {state.kind === 'asking' ? 'Asking the session…' : label}
      </button>
      {state.kind === 'asking' && <p className="muted">This reads the whole session again, so it can take a minute or two. It uses your Claude usage.</p>}
      {state.kind === 'answer' && <p className="report explain__answer">{state.text}</p>}
      {state.kind === 'error' && <p className="notice-inline notice-inline--error">{state.text}</p>}
    </div>
  );
}
