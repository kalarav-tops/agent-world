/** Header that carries the access key on every API request. */
const TOKEN_HEADER = 'x-agent-world-token';

/** WebSocket subprotocol the server answers to. */
const WS_PROTOCOL = 'agent-world';

/** Prefix of the subprotocol entry that carries the key: a browser WebSocket cannot set headers. */
const WS_TOKEN_PREFIX = 'agent-world-token.';

const STORAGE_KEY = 'agent-world-token';
const TOKEN_SHAPE = /^[0-9a-f]{16,128}$/;

let cached: string | null | undefined;

/**
 * The access key for this tab. The terminal prints a link ending in `#token=…`; the key is moved
 * from the address bar into this tab's session storage, so it does not stay visible on screen, and a
 * reload keeps working. The fragment is never sent to the server by the browser.
 * @returns the key, or null when the page was opened without its link
 */
export function accessToken(): string | null {
  if (cached !== undefined) return cached;
  const fromLink = new URLSearchParams(location.hash.slice(1)).get('token');
  if (fromLink && TOKEN_SHAPE.test(fromLink)) {
    remember(fromLink);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    cached = fromLink;
    return cached;
  }
  cached = recall();
  return cached;
}

/**
 * Fetch from the Agent World API with the access key.
 * @param path - API path
 * @param init - fetch options
 * @returns the response
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = accessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set(TOKEN_HEADER, token);
  return fetch(path, { ...init, headers });
}

/**
 * Subprotocols to open the live connection with: the protocol name and the access key.
 * @returns protocol list
 */
export function socketProtocols(): string[] {
  const token = accessToken();
  return token ? [WS_PROTOCOL, `${WS_TOKEN_PREFIX}${token}`] : [WS_PROTOCOL];
}

/**
 * Store the key for this tab.
 * @param token - access key
 */
function remember(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch (error) {
    console.warn('agent-world: could not keep the access key for reloads', error);
  }
}

/**
 * The key stored for this tab.
 * @returns the key, or null
 */
function recall(): string | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored && TOKEN_SHAPE.test(stored) ? stored : null;
  } catch {
    return null;
  }
}
