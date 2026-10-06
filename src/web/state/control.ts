import { useEffect, useState } from 'react';
import { apiFetch } from './access';

/** Whether the command centre is on. */
export interface ControlAccess {
  enabled: boolean;
}

/** The outcome of a command-centre request. */
export type ControlReply<T> = { ok: true; result: T } | { ok: false; error: string };

/**
 * Read whether the command centre is on, refreshing whenever the live connection comes back (the
 * server may have restarted with different flags).
 * @param connected - whether the live connection is up
 * @returns access details
 */
export function useControlAccess(connected: boolean): ControlAccess {
  const [access, setAccess] = useState<ControlAccess>({ enabled: false });
  useEffect(() => {
    if (!connected) return undefined;
    const controller = new AbortController();
    apiFetch('/api/control', { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ enabled?: boolean }>) : { enabled: false }))
      .then((body) => setAccess({ enabled: body.enabled === true }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.warn('agent-world: could not read the command centre state', error);
        setAccess({ enabled: false });
      });
    return () => controller.abort();
  }, [connected]);
  return access;
}

/**
 * Send a command-centre request.
 * @param access - access details
 * @param path - API path
 * @param body - JSON body
 * @returns the result, or a readable error
 */
export async function sendControl<T>(access: ControlAccess, path: string, body: unknown): Promise<ControlReply<T>> {
  if (!access.enabled) return { ok: false, error: 'The command centre is off. Start Agent World with --allow-control.' };
  try {
    const response = await apiFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (response.status === 401) return { ok: false, error: 'Agent World restarted with a new access key. Open the link it printed in the terminal.' };
    const parsed = (await response.json()) as { result?: T; error?: string };
    return response.ok ? { ok: true, result: parsed.result as T } : { ok: false, error: parsed.error ?? `Request failed (${response.status}).` };
  } catch {
    return { ok: false, error: 'Agent World is not reachable. Is it still running?' };
  }
}
