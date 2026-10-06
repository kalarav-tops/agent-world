import { useEffect, useRef, useState } from 'react';
import type { Lab, WorldMessage, WorldSummary } from '../../shared/types';
import { accessToken, apiFetch, socketProtocols } from './access';

/** Live connection to the local server. */
export interface WorldConnection {
  world: WorldSummary | null;
  connected: boolean;
  /** The server refused this page's access key, or the page was opened without its link. */
  denied: boolean;
}

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10_000;
const DETAIL_MIN_INTERVAL_MS = 1000;

/**
 * Subscribe to the world over the WebSocket, reconnecting with backoff when the server restarts.
 * When the connection drops, a quick API check tells a refused access key (the server restarted with
 * a new one, or the page was opened without its link) apart from a server that is down.
 * @returns the latest world, whether the socket is open, and whether access was refused
 */
export function useWorld(): WorldConnection {
  const [world, setWorld] = useState<WorldSummary | null>(null);
  const [connected, setConnected] = useState(false);
  const [denied, setDenied] = useState(() => accessToken() === null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let delay = RECONNECT_MIN_MS;
    let stopped = false;

    const connect = (): void => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/ws`, socketProtocols());
      socket.onopen = () => {
        delay = RECONNECT_MIN_MS;
        setConnected(true);
        setDenied(false);
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        const message = parseMessage(event.data);
        if (message) setWorld(message.world);
      };
      socket.onclose = () => {
        setConnected(false);
        if (stopped) return;
        apiFetch('/api/control')
          .then((response) => setDenied(response.status === 401))
          .catch(() => setDenied(accessToken() === null));
        retryTimer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, RECONNECT_MAX_MS);
      };
    };
    connect();

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return { world, connected, denied };
}

/**
 * Full detail of one lab, refetched (at most once a second) whenever its version changes.
 * @param sessionId - session id, or null when no lab is selected
 * @param labId - lab id, or null
 * @param version - the lab version from the world summary
 * @returns the lab detail, or null while loading or when nothing is selected
 */
export function useLabDetail(sessionId: string | null, labId: string | null, version: number): Lab | null {
  const [lab, setLab] = useState<Lab | null>(null);
  const lastFetch = useRef(0);
  const sequence = useRef(0);

  useEffect(() => {
    sequence.current += 1;
    setLab(null);
  }, [sessionId, labId]);

  useEffect(() => {
    if (!sessionId || !labId) return undefined;
    const wait = Math.max(0, lastFetch.current + DETAIL_MIN_INTERVAL_MS - Date.now());
    const timer = window.setTimeout(() => {
      lastFetch.current = Date.now();
      const request = ++sequence.current;
      apiFetch(`/api/labs/${encodeURIComponent(sessionId)}/${encodeURIComponent(labId)}`)
        .then((response) => (response.ok ? (response.json() as Promise<Lab>) : null))
        .then((detail) => {
          if (request === sequence.current) setLab(detail);
        })
        .catch(() => {
          if (request === sequence.current) setLab(null);
        });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [sessionId, labId, version]);

  return lab;
}

/**
 * The current time, updated on an interval.
 * @param intervalMs - update interval
 * @returns epoch milliseconds
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Whether the user asked the system to minimise motion.
 * @returns true when reduced motion is preferred
 */
export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (): void => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

/**
 * Parse a WebSocket payload, ignoring anything that is not a world message.
 * @param data - raw message text
 * @returns the message, or null
 */
function parseMessage(data: string): WorldMessage | null {
  try {
    const message = JSON.parse(data) as Partial<WorldMessage>;
    return message.type === 'world' && message.world ? (message as WorldMessage) : null;
  } catch {
    return null;
  }
}
