import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { sendControl, type ControlAccess } from '../state/control';
import { useProjects } from '../state/ship';
import { Icon } from '../ui/icons';

const MODES = { default: 'Ask before risky actions', acceptEdits: 'Accept file edits', plan: 'Plan only, change nothing' } as const;
const MODELS = { '': 'Default model', opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', fable: 'Fable' } as const;
const EFFORTS = { '': 'Default effort', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' } as const;

/**
 * The Launch screen: start a fresh conversation in a project, with its permissions, model and effort.
 * @param props - access and what to do once launched
 * @returns the screen
 */
export function LaunchScreen({ access, onLaunched }: { access: ControlAccess; onLaunched: (launchId: string) => void }): ReactElement {
  const { projects, error: listError, reload } = useProjects(access.enabled);
  const [projectId, setProjectId] = useState('');
  const [mode, setMode] = useState<keyof typeof MODES>('default');
  const [model, setModel] = useState<keyof typeof MODELS>('');
  const [effort, setEffort] = useState<keyof typeof EFFORTS>('');
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' } | { kind: 'error'; text: string }>({ kind: 'idle' });

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const launch = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    if (state.kind === 'sending' || !prompt.trim() || !projectId) return;
    setState({ kind: 'sending' });
    const reply = await sendControl<{ launchId: string; sessionId: string }>(access, '/api/launches', { projectId, prompt, permissionMode: mode, model, effort });
    if (!reply.ok) {
      setState({ kind: 'error', text: reply.error });
      if (reply.error.includes('no longer exists') || reply.error.includes('not in the list')) reload();
      return;
    }
    setPrompt('');
    setState({ kind: 'idle' });
    onLaunched(reply.result.launchId);
  };

  if (!access.enabled) {
    return (
      <section className="screen" aria-label="Launch">
        <h2 className="screen__title">Launch</h2>
        <p className="muted">The command centre is off, so Agent World only watches. To launch conversations, restart it with:</p>
        <pre className="command__code">npm start -- --allow-control</pre>
        <p className="muted">To answer agent questions and permission prompts in the world as well, add the hook it prints with:</p>
        <pre className="command__code">node dist/server/cli.js hooks</pre>
      </section>
    );
  }
  return (
    <form className="screen" aria-label="Launch" onSubmit={(event) => void launch(event)}>
      <h2 className="screen__title">Launch a fresh conversation</h2>
      <label className="field">
        <span className="field__label">Project</span>
        <select className="field__input" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
              {project.branch ? ` (${project.branch})` : ''}
              {project.live ? ' · live' : ''}
            </option>
          ))}
        </select>
      </label>
      {listError && <p className="notice-inline notice-inline--error">{listError}</p>}
      <div className="screen__row">
        <label className="field">
          <span className="field__label">Permissions</span>
          <select className="field__input" value={mode} onChange={(event) => setMode(event.target.value as keyof typeof MODES)}>
            {(Object.keys(MODES) as Array<keyof typeof MODES>).map((key) => <option key={key} value={key}>{MODES[key]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Model</span>
          <select className="field__input" value={model} onChange={(event) => setModel(event.target.value as keyof typeof MODELS)}>
            {(Object.keys(MODELS) as Array<keyof typeof MODELS>).map((key) => <option key={key} value={key}>{MODELS[key]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Effort</span>
          <select className="field__input" value={effort} onChange={(event) => setEffort(event.target.value as keyof typeof EFFORTS)}>
            {(Object.keys(EFFORTS) as Array<keyof typeof EFFORTS>).map((key) => <option key={key} value={key}>{EFFORTS[key]}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">Prompt</span>
        <textarea
          className="field__input field__input--prompt"
          rows={6}
          value={prompt}
          placeholder="Describe the work, as you would in Claude Code"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void launch();
          }}
        />
      </label>
      <button type="submit" className="button button--primary" disabled={state.kind === 'sending' || !prompt.trim() || !projectId}>
        <Icon name="command" />
        {state.kind === 'sending' ? 'Launching…' : 'Launch'}
      </button>
      {state.kind === 'error' && <p className="notice-inline notice-inline--error" role="status">{state.text}</p>}
      <small className="muted">Ctrl+Enter launches. Each launch uses your Claude usage and rises as its own island.</small>
    </form>
  );
}
