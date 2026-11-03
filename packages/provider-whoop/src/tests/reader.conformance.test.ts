import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateFhir } from '@open-twin/fhir-r4';
import type { HostServices, ReaderInput, StoredTokens, TokenStore } from '@open-twin/reader-core';
import {
  type ConformanceFixture,
  describeReaderConformance,
  type ExpectedSummary
} from '@open-twin/reader-core/testing';
import { describe, expect, it } from 'vitest';
import { WHOOP_DESCRIPTOR, WhoopReader } from '../reader';
import { whoopBundle } from '../verification/exampleBundle';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const sync = JSON.parse(readFileSync(join(FIXTURES, 'whoop-sync.json'), 'utf8')) as Record<string, unknown[]>;

const ACCESS_TOKEN = 'whoop-access-token-0123456789abcdef';
const REFRESH_TOKEN = 'whoop-refresh-token-0123456789abcdef';
const CLIENT_SECRET = 'whoop-client-secret-0123456789';

const config = { clientId: 'test-client', clientSecret: CLIENT_SECRET, redirectUri: 'https://example.org/callback' };

function memoryTokenStore(initial?: StoredTokens): TokenStore & { saved: Map<string, StoredTokens> } {
  const saved = new Map<string, StoredTokens>();
  if (initial) saved.set('wearer-1', initial);
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

const validTokens: StoredTokens = {
  accessToken: ACCESS_TOKEN,
  refreshToken: REFRESH_TOKEN,
  expiresAt: '2099-01-01T00:00:00Z'
};

/** Replays the recorded sync fixture as one page per collection, for any window. */
export function replayWhoop(fixture: Record<string, unknown[]> = sync): typeof fetch {
  return (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const page = (records: unknown[] | undefined) =>
      new Response(JSON.stringify({ records: records ?? [], next_token: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    if (url.pathname.endsWith('/recovery')) return Promise.resolve(page(fixture.recovery));
    if (url.pathname.endsWith('/cycle')) return Promise.resolve(page(fixture.cycles));
    if (url.pathname.endsWith('/activity/sleep')) return Promise.resolve(page(fixture.sleep));
    return Promise.resolve(new Response('{"detail":"Not Found"}', { status: 404 }));
  };
}

const input: ReaderInput = { kind: 'api', sourceId: 'whoop', config, tokenKey: 'wearer-1' };
const host = (): HostServices => ({ tokenStore: memoryTokenStore(validTokens), fetch: replayWhoop() });
const window = { start: '2026-06-19T00:00:00+02:00', end: '2026-06-21T00:00:00+02:00' };

const fixture: ConformanceFixture = {
  name: 'recorded sync, one recovery, one cycle, one sleep',
  input,
  host: host(),
  request: { subjectKey: 'whoop-exemplar-wearer', window },
  expected: JSON.parse(readFileSync(join(FIXTURES, 'whoop-sync.expected.json'), 'utf8')) as ExpectedSummary
};

describeReaderConformance(() => new WhoopReader(), {
  registryEntry: WHOOP_DESCRIPTOR,
  fixtures: [fixture],
  invalidInput: { kind: 'api', sourceId: 'whoop', config: { clientId: 'x' }, tokenKey: 'wearer-1' },
  validate: validateFhir,
  secrets: { 'access token': ACCESS_TOKEN, 'refresh token': REFRESH_TOKEN, 'client secret': CLIENT_SECRET }
});

describe('WhoopReader beyond the shared suite', () => {
  it('requires an api input, a valid config and a tokenKey, naming the field and never the value', async () => {
    await expect(new WhoopReader().open({ kind: 'file', text: '{}' })).rejects.toMatchObject({ code: 'validation' });
    const bad = new WhoopReader().open({
      kind: 'api',
      sourceId: 'whoop',
      config: { ...config, redirectUri: 'nope' },
      tokenKey: 'w'
    });
    await expect(bad).rejects.toThrow(/redirectUri/);
    await expect(bad).rejects.not.toThrow(new RegExp(CLIENT_SECRET));
    await expect(new WhoopReader().open({ kind: 'api', sourceId: 'whoop', config })).rejects.toThrow(/tokenKey/);
  });

  it('restores tokens at open and saves them at close', async () => {
    const store = memoryTokenStore({ ...validTokens, expiresAt: '2099-06-01T12:00:00.000Z' });
    const reader = new WhoopReader();
    await reader.open(input, { tokenStore: store, fetch: replayWhoop() });
    store.saved.clear();
    await reader.close();
    expect(store.saved.get('wearer-1')).toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      expiresAt: '2099-06-01T12:00:00.000Z'
    });
  });

  it('needs a window, reports a narrower types request, and fails read with auth without tokens', async () => {
    const reader = new WhoopReader();
    await reader.open(input, host());
    await expect(reader.read({ subjectKey: 's' })).rejects.toMatchObject({ code: 'validation', operation: 'read' });
    const previous = globalThis.fetch;
    globalThis.fetch = replayWhoop();
    try {
      const { issues } = await reader.read({ subjectKey: 's', window, types: ['sleep', 'steps'] });
      const codes = issues.map((i) => i.code);
      expect(codes).toContain('unknown-type');
      expect(codes).toContain('types-not-applied');
    } finally {
      globalThis.fetch = previous;
    }
    const bare = new WhoopReader();
    await bare.open(input, { tokenStore: memoryTokenStore(), fetch: replayWhoop() });
    await expect(bare.read({ subjectKey: 's', window })).rejects.toMatchObject({ code: 'auth' });
  });

  it('puts the window into the bundle key, so two windows never share an id', async () => {
    const reader = new WhoopReader();
    await reader.open(input, host());
    const previous = globalThis.fetch;
    globalThis.fetch = replayWhoop();
    try {
      const first = await reader.read({ subjectKey: 's', window });
      const second = await reader.read({
        subjectKey: 's',
        window: { start: '2026-06-21T00:00:00+02:00', end: '2026-06-23T00:00:00+02:00' }
      });
      expect(first.bundle.id).not.toBe(second.bundle.id);
    } finally {
      globalThis.fetch = previous;
    }
    // The verification bundle carries no window and keeps a stable id of its own.
    expect(whoopBundle().id).toBe(whoopBundle().id);
  });
});
