import { describe, expect, it } from 'vitest';
import {
  hookSignature,
  isAuthorised,
  isValidNonce,
  NONCE_HEADER,
  secretMatches,
  serverProof,
  SIGNATURE_HEADER,
  socketToken,
  TOKEN_HEADER,
} from '../../src/server/security';

const TOKEN = 'a'.repeat(48);
const NONCE = 'n0nce-0123456789abcdef';

describe('access token', () => {
  it('matches only the exact token, and never an empty expected token', () => {
    expect(secretMatches(TOKEN, TOKEN)).toBe(true);
    expect(secretMatches(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(secretMatches('b'.repeat(48), TOKEN)).toBe(false);
    expect(secretMatches(undefined, TOKEN)).toBe(false);
    expect(secretMatches('', '')).toBe(false);
    expect(secretMatches(['x'], TOKEN)).toBe(false);
  });

  it('reads the token from the WebSocket subprotocol list', () => {
    expect(socketToken(`agent-world, agent-world-token.${TOKEN}`)).toBe(TOKEN);
    expect(socketToken('agent-world')).toBeUndefined();
    expect(socketToken(undefined)).toBeUndefined();
  });

  it('authorises the page by token and the hook by a signed nonce', () => {
    expect(isAuthorised({ [TOKEN_HEADER]: TOKEN }, TOKEN)).toBe(true);
    expect(isAuthorised({ [NONCE_HEADER]: NONCE, [SIGNATURE_HEADER]: hookSignature(TOKEN, NONCE) }, TOKEN)).toBe(true);
    expect(isAuthorised({}, TOKEN)).toBe(false);
    expect(isAuthorised({ [TOKEN_HEADER]: 'wrong' }, TOKEN)).toBe(false);
    expect(isAuthorised({ [NONCE_HEADER]: NONCE, [SIGNATURE_HEADER]: hookSignature('other', NONCE) }, TOKEN)).toBe(false);
    expect(isAuthorised({ [NONCE_HEADER]: 'short', [SIGNATURE_HEADER]: hookSignature(TOKEN, 'short') }, TOKEN)).toBe(false);
  });

  it('keeps the server proof distinct from the hook signature', () => {
    expect(serverProof(TOKEN, NONCE)).not.toBe(hookSignature(TOKEN, NONCE));
    expect(serverProof(TOKEN, NONCE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts only nonces of a safe shape', () => {
    expect(isValidNonce(NONCE)).toBe(true);
    expect(isValidNonce('x'.repeat(15))).toBe(false);
    expect(isValidNonce('x'.repeat(129))).toBe(false);
    expect(isValidNonce('has spaces in it, sixteen+')).toBe(false);
    expect(isValidNonce(42)).toBe(false);
  });
});
