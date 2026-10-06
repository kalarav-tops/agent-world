import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { join, resolve, sep } from 'node:path';

/** Header that carries the per-start access token on every API request from the page. */
export const TOKEN_HEADER = 'x-agent-world-token';

/** Header carrying the hook's one-time random value. */
export const NONCE_HEADER = 'x-agent-world-nonce';

/** Header carrying the hook's signature of its nonce, so the token itself never leaves the hook. */
export const SIGNATURE_HEADER = 'x-agent-world-signature';

/** Header carrying the server's proof that it knows the token, checked by the hook before it trusts an answer. */
export const PROOF_HEADER = 'x-agent-world-proof';

/** WebSocket subprotocol the page asks for and the server echoes back. */
export const WS_PROTOCOL = 'agent-world';

/** Prefix of the subprotocol entry that carries the token: a browser WebSocket cannot set headers. */
export const WS_TOKEN_PREFIX = 'agent-world-token.';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'];
const NONCE = /^[\w-]{16,128}$/;

/**
 * Whether a Host header names this server on loopback. Anything else is refused, which stops
 * a DNS-rebinding page from reaching the API through a hostname it controls.
 * @param host - the Host header
 * @param port - this server's port
 * @returns true when allowed
 */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  return LOOPBACK_HOSTS.some((name) => host === `${name}:${port}`);
}

/**
 * Whether a WebSocket Origin may connect. Browsers always send Origin and a WebSocket is not
 * covered by CORS, so only this server's own pages (and any configured dev origin) are let in.
 * Non-browser clients send no Origin and are allowed.
 * @param origin - the Origin header
 * @param port - this server's port
 * @param extraOrigins - additional allowed origins, such as the Vite dev server
 * @returns true when allowed
 */
export function isAllowedOrigin(origin: string | undefined, port: number, extraOrigins: readonly string[] = []): boolean {
  if (origin === undefined) return true;
  return LOOPBACK_HOSTS.some((name) => origin === `http://${name}:${port}`) || extraOrigins.includes(origin);
}

/**
 * Map a request path to a file inside the web folder. Paths that do not name an existing file
 * inside it fall back to `index.html`, so the resolved path can never leave the folder.
 * @param webDir - built UI folder
 * @param urlPath - request path without query string
 * @returns file to serve, or null when the path cannot be decoded
 */
export function resolveStatic(webDir: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const root = resolve(webDir);
  const index = join(root, 'index.html');
  const candidate = resolve(root, `.${decoded}`);
  if (!candidate.startsWith(root + sep)) return index;
  return existsSync(candidate) && statSync(candidate).isFile() ? candidate : index;
}

/**
 * Whether a presented secret equals the expected one, compared in constant time.
 * @param given - presented value
 * @param expected - expected value; an empty one never matches
 * @returns true when they match
 */
export function secretMatches(given: unknown, expected: string): boolean {
  if (!expected || typeof given !== 'string') return false;
  const actual = Buffer.from(given);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

/**
 * The token a WebSocket upgrade carries in its subprotocol list.
 * @param header - the Sec-WebSocket-Protocol header
 * @returns the token, or undefined
 */
export function socketToken(header: string | undefined): string | undefined {
  const entry = (header ?? '')
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith(WS_TOKEN_PREFIX));
  return entry?.slice(WS_TOKEN_PREFIX.length);
}

/**
 * Whether a nonce has a safe shape.
 * @param nonce - nonce header value
 * @returns true when usable
 */
export function isValidNonce(nonce: unknown): nonce is string {
  return typeof nonce === 'string' && NONCE.test(nonce);
}

/**
 * The hook's signature of its nonce. It authenticates the hook without sending the token, so a
 * program squatting on the port never learns it.
 * @param token - access token
 * @param nonce - one-time random value
 * @returns hex signature
 */
export function hookSignature(token: string, nonce: string): string {
  return createHmac('sha256', token).update(`hook:${nonce}`).digest('hex');
}

/**
 * The server's proof that it knows the token, for the hook's nonce. Domain-separated from the
 * hook's signature, so a squatter cannot echo the signature back as a proof.
 * @param token - access token
 * @param nonce - the hook's nonce
 * @returns hex proof
 */
export function serverProof(token: string, nonce: string): string {
  return createHmac('sha256', token).update(`server:${nonce}`).digest('hex');
}

/**
 * Whether an API request is authorised: the page sends the token itself, the hook sends a signed
 * nonce instead.
 * @param headers - request headers
 * @param token - access token
 * @returns true when authorised
 */
export function isAuthorised(headers: IncomingHttpHeaders, token: string): boolean {
  if (secretMatches(headers[TOKEN_HEADER], token)) return true;
  const nonce = headers[NONCE_HEADER];
  return Boolean(token) && isValidNonce(nonce) && secretMatches(headers[SIGNATURE_HEADER], hookSignature(token, nonce));
}
