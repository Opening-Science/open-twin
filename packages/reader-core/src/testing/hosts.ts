/**
 * WHAT: Test doubles for the host side of a reader: an in-memory token store, a fetch that replays recorded responses, and the shared tests for an OAuthReader's token bridge.
 * NOT:  Not for production hosts; the stores here forget everything when the test ends.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d8
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { describe, expect, it } from 'vitest';
import type { IHealthDataReader } from '../reader';
import type { ReaderInput, StoredTokens, TokenStore } from '../types';

export interface MemoryTokenStore extends TokenStore {
  readonly saved: Map<string, StoredTokens>;
}

export function memoryTokenStore(initial: Record<string, StoredTokens> = {}): MemoryTokenStore {
  const saved = new Map(Object.entries(initial));
  return {
    saved,
    load: (key) => Promise.resolve(saved.get(key)),
    save: (key, tokens) => {
      saved.set(key, tokens);
      return Promise.resolve();
    },
    clear: (key) => {
      saved.delete(key);
      return Promise.resolve();
    }
  };
}

/** A fetch that answers each request from `route`: a JSON body, or undefined for a 404. */
export function replayFetch(route: (url: URL) => unknown): typeof fetch {
  return (input) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = route(new URL(href));
    const json = (value: unknown, status: number) =>
      new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
    return Promise.resolve(body === undefined ? json({ detail: 'Not Found' }, 404) : json(body, 200));
  };
}

export interface TokenBridgeCase {
  /** An api input with its tokenKey. */
  input: ReaderInput;
  /** What the store holds for that key before open. */
  tokens: StoredTokens;
  /** A config value that must never appear in an error. */
  secret: string;
}

/** The behaviour every OAuthReader shares: config errors name fields, tokens round-trip, no tokens means auth. */
export function describeTokenBridge(factory: () => IHealthDataReader, c: TokenBridgeCase): void {
  const key = c.input.kind === 'api' ? (c.input.tokenKey ?? '') : '';
  describe('token bridge', () => {
    it('rejects a file input, a bad config naming the field, and a missing tokenKey', async () => {
      await expect(factory().open({ kind: 'file', text: '{}' })).rejects.toMatchObject({ code: 'validation' });
      const bad =
        c.input.kind === 'api'
          ? { ...c.input, config: { ...(c.input.config as object), redirectUri: 'nope' } }
          : c.input;
      const rejected = factory().open(bad);
      await expect(rejected).rejects.toMatchObject({ code: 'validation', operation: 'open' });
      await expect(rejected).rejects.toThrow(/redirectUri/);
      await expect(rejected).rejects.not.toThrow(new RegExp(c.secret));
      const noKey = c.input.kind === 'api' ? { ...c.input, tokenKey: undefined } : c.input;
      await expect(factory().open(noKey)).rejects.toThrow(/tokenKey/);
    });

    it('restores tokens at open and saves them back at close, idempotently', async () => {
      const store = memoryTokenStore({ [key]: c.tokens });
      const reader = factory();
      await reader.open(c.input, { tokenStore: store });
      store.saved.clear();
      await reader.close();
      await reader.close();
      expect(store.saved.size).toBe(1);
      expect(store.saved.get(key)).toEqual({
        accessToken: c.tokens.accessToken,
        refreshToken: c.tokens.refreshToken,
        expiresAt: new Date(c.tokens.expiresAt).toISOString()
      });
    });

    it('fails read with auth when nothing is stored and no code was given', async () => {
      const reader = factory();
      await reader.open(c.input, { tokenStore: memoryTokenStore() });
      await expect(
        reader.read({ subjectKey: 's', window: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' } })
      ).rejects.toMatchObject({ code: 'auth' });
    });
  });
}
