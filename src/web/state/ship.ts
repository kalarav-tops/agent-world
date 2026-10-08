import { useCallback, useEffect, useState } from 'react';
import type { ConversationItem, ProjectView } from '../../shared/types';
import { apiFetch } from './access';

const POLL_MS = 2000;

/**
 * The projects a fresh conversation can start in.
 * @param enabled - whether the command centre is on
 * @returns projects, an error and a reload function
 */
export function useProjects(enabled: boolean): { projects: ProjectView[]; error: string | null; reload: () => void } {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    apiFetch('/api/projects', { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ result: ProjectView[] }>) : Promise.reject(new Error(String(response.status)))))
      .then((body) => {
        setProjects(body.result);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('agent-world: could not load projects', reason);
        setError('Could not load the project list.');
      });
    return () => controller.abort();
  }, [enabled, round]);
  return { projects, error, reload: useCallback(() => setRound((value) => value + 1), []) };
}

/**
 * A conversation, refetched every 2 seconds while its session is live.
 * @param sessionId - session to read, or null for none
 * @param live - whether to keep polling
 * @returns items and an error
 */
export function useConversation(sessionId: string | null, live: boolean): { items: ConversationItem[]; error: string | null } {
  const [loaded, setLoaded] = useState<LoadedConversation>({ sessionId: null, items: [] });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionId) return undefined;
    setError(null);
    let stopped = false;
    const load = (): void => {
      apiFetch(`/api/conversations/${encodeURIComponent(sessionId)}`)
        .then(async (response) => {
          const body = (await response.json()) as { items?: ConversationItem[]; error?: string };
          if (stopped) return;
          if (response.ok) {
            setLoaded({ sessionId, items: body.items ?? [] });
            setError(null);
          } else {
            setError(response.status === 404 ? body.error ?? 'This conversation is not available.' : `Could not read it (${response.status}).`);
          }
        })
        .catch((reason: unknown) => {
          console.warn('agent-world: could not read the conversation', reason);
          if (!stopped) setError('Agent World is not reachable. Is it still running?');
        });
    };
    load();
    const timer = live ? setInterval(load, POLL_MS) : null;
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [sessionId, live]);
  return { items: conversationFor(loaded, sessionId), error };
}

/** A conversation and the session it was loaded for. */
interface LoadedConversation {
  sessionId: string | null;
  items: ConversationItem[];
}

/**
 * The items to show for a session: none until its own conversation has loaded, so switching from
 * one conversation to another never shows the previous one under the new title.
 * @param loaded - the last conversation loaded
 * @param sessionId - the session being shown
 * @returns items
 */
export function conversationFor(loaded: LoadedConversation, sessionId: string | null): ConversationItem[] {
  return loaded.sessionId === sessionId ? loaded.items : [];
}
