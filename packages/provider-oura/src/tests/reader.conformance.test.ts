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
import { OURA_DESCRIPTOR, OuraReader, offsetOf } from '../reader';
import capture from './fixtures/sandbox-capture.json';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const captured = capture as Record<string, unknown>;
const CAPTURED_SCOPES = Object.keys(captured).sort();

const ACCESS_TOKEN = 'sandbox-access-token-0123456789abcdef';
const REFRESH_TOKEN = 'sandbox-refresh-token-0123456789abcdef';
const CLIENT_SECRET = 'test-client-secret-0123456789';

const config = {
  clientId: 'test-client',
  clientSecret: CLIENT_SECRET,
  redirectUri: 'https://example.org/callback',
  sandbox: true
};

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

/** Replays the recorded sandbox capture for any window; a scope not in the capture is a 404, as the sandbox answers for personal_info. */
const replay: typeof fetch = (input) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const scope = url.pathname.split('/').at(-1) ?? '';
  if (!url.pathname.startsWith('/v2/sandbox/usercollection/') || !(scope in captured)) {
    return Promise.resolve(
      new Response('{"detail":"Not Found"}', { status: 404, headers: { 'content-type': 'application/json' } })
    );
  }
  return Promise.resolve(
    new Response(JSON.stringify(captured[scope]), { status: 200, headers: { 'content-type': 'application/json' } })
  );
};

const input: ReaderInput = { kind: 'api', sourceId: 'oura', config, tokenKey: 'wearer-1' };
const host = (): HostServices => ({ tokenStore: memoryTokenStore(validTokens), fetch: replay });

const fixture: ConformanceFixture = {
  name: 'sandbox capture, 13 scopes, one week',
  input,
  host: host(),
  request: {
    subjectKey: 'sandbox-subject',
    types: CAPTURED_SCOPES,
    window: { start: '2024-01-01T00:00:00+02:00', end: '2024-01-07T23:59:59+02:00' }
  },
  expected: JSON.parse(readFileSync(join(FIXTURES, 'sandbox-capture.expected.json'), 'utf8')) as ExpectedSummary
};

describeReaderConformance(() => new OuraReader(), {
  registryEntry: OURA_DESCRIPTOR,
  fixtures: [fixture],
  invalidInput: { kind: 'api', sourceId: 'oura', config: { clientId: 'x' }, tokenKey: 'wearer-1' },
  validate: validateFhir,
  secrets: { 'access token': ACCESS_TOKEN, 'refresh token': REFRESH_TOKEN, 'client secret': CLIENT_SECRET }
});

describe('OuraReader beyond the shared suite', () => {
  it('requires an api input, a valid config and a per-wearer tokenKey, naming the field and never the value', async () => {
    await expect(new OuraReader().open({ kind: 'file', text: '{}' })).rejects.toMatchObject({ code: 'validation' });
    const bad = new OuraReader().open({
      kind: 'api',
      sourceId: 'oura',
      config: { ...config, redirectUri: 'nope' },
      tokenKey: 'w'
    });
    await expect(bad).rejects.toMatchObject({ code: 'validation', operation: 'open' });
    await expect(bad).rejects.toThrow(/redirectUri/);
    await expect(bad).rejects.not.toThrow(new RegExp(CLIENT_SECRET));
    await expect(new OuraReader().open({ kind: 'api', sourceId: 'oura', config })).rejects.toThrow(/tokenKey/);
  });

  it('restores tokens from the host store at open and saves them back at close', async () => {
    const store = memoryTokenStore({ ...validTokens, expiresAt: '2099-06-01T12:00:00.000Z' });
    const reader = new OuraReader();
    await reader.open(input, { tokenStore: store, fetch: replay });
    store.saved.clear();
    await reader.close();
    expect(store.saved.get('wearer-1')).toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      expiresAt: '2099-06-01T12:00:00.000Z'
    });
    await reader.close();
    expect(store.saved.size).toBe(1);
  });

  it('fails read with auth when the store holds no tokens and no code was given', async () => {
    const reader = new OuraReader();
    await reader.open(input, { tokenStore: memoryTokenStore(), fetch: replay });
    await expect(reader.read({ subjectKey: 's', types: ['sleep'] })).rejects.toMatchObject({ code: 'auth' });
  });

  it('rejects a window without an offset instead of assuming UTC (D7)', async () => {
    const reader = new OuraReader();
    await reader.open(input, host());
    await expect(
      reader.read({
        subjectKey: 's',
        types: ['sleep'],
        window: { start: '2024-01-01T00:00:00', end: '2024-01-02T00:00:00' }
      })
    ).rejects.toMatchObject({ code: 'validation', operation: 'read' });
    expect(offsetOf('2024-01-01T00:00:00Z')).toBe('+00:00');
    expect(offsetOf('2024-01-01T00:00:00-05:30')).toBe('-05:30');
    expect(offsetOf('2024-01-01')).toBeUndefined();
  });

  it('reports an unknown type and a scope the sandbox cannot serve as issues, and still returns the bundle (D6)', async () => {
    const reader = new OuraReader();
    await reader.open(input, host());
    const previous = globalThis.fetch;
    globalThis.fetch = replay;
    try {
      const { bundle, issues } = await reader.read({
        subjectKey: 'sandbox-subject',
        types: ['sleep', 'personal_info', 'not-a-scope'],
        window: fixture.request.window
      });
      const codes = issues.map((i) => `${i.severity}:${i.code}`);
      expect(codes).toContain('warning:unknown-type');
      expect(codes).toContain('error:not-found');
      expect(JSON.stringify(issues)).not.toContain(ACCESS_TOKEN);
      expect((bundle.entry ?? []).some((e) => e.resource?.resourceType === 'Observation')).toBe(true);
    } finally {
      globalThis.fetch = previous;
    }
  });

  it('describe says whether the sandbox is in use and names the host only', async () => {
    const reader = new OuraReader();
    await reader.open(input, host());
    expect(await reader.describe()).toMatchObject({
      source: { id: 'oura', apiVersion: 'v2', endpoint: 'api.ouraring.com' },
      capabilities: { sandbox: true, write: false }
    });
  });
});
