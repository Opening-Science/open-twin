import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateFhir } from '@open-twin/fhir-r4';
import type { ReaderInput, StoredTokens } from '@open-twin/reader-core';
import {
  type ConformanceFixture,
  describeReaderConformance,
  describeTokenBridge,
  type ExpectedSummary,
  memoryTokenStore,
  withGlobalFetch
} from '@open-twin/reader-core/testing';
import { describe, expect, it } from 'vitest';
import { GOOGLE_HEALTH_DESCRIPTOR, GoogleHealthReader } from '../reader';
import { replayGoogleHealth } from './support/replay';

const ACCESS_TOKEN = 'google-access-token-0123456789abcdef';
const REFRESH_TOKEN = 'google-refresh-token-0123456789abcdef';
const CLIENT_SECRET = 'google-client-secret-0123456789';
const tokens: StoredTokens = {
  accessToken: ACCESS_TOKEN,
  refreshToken: REFRESH_TOKEN,
  expiresAt: '2099-01-01T00:00:00.000Z'
};

const input: ReaderInput = {
  kind: 'api',
  sourceId: 'google-health',
  config: {
    clientId: 'test-client',
    clientSecret: CLIENT_SECRET,
    redirectUri: 'https://example.org/callback',
    timeZone: 'Europe/Zurich'
  },
  tokenKey: 'wearer-1'
};
const window = { start: '2026-07-06T00:00:00+02:00', end: '2026-07-08T00:00:00+02:00' };
const types = ['distance', 'heart-rate', 'height', 'sleep', 'steps', 'weight'];
const replay = replayGoogleHealth();

const fixture: ConformanceFixture = {
  name: 'six types over two days, one step count missing',
  input,
  host: { tokenStore: memoryTokenStore({ 'wearer-1': tokens }), fetch: replay },
  request: { subjectKey: '8338456149191909237', window, types },
  expected: JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', 'google-health-sync.expected.json'), 'utf8')
  ) as ExpectedSummary
};

describeReaderConformance(() => new GoogleHealthReader(), {
  descriptor: GOOGLE_HEALTH_DESCRIPTOR,
  fixtures: [fixture],
  invalidInput: { ...input, config: { clientId: 'x' } },
  validate: validateFhir,
  secrets: { 'access token': ACCESS_TOKEN, 'refresh token': REFRESH_TOKEN, 'client secret': CLIENT_SECRET }
});

describeTokenBridge(() => new GoogleHealthReader(), { input, tokens, secret: CLIENT_SECRET });

describe('GoogleHealthReader beyond the shared suites', () => {
  async function opened(): Promise<GoogleHealthReader> {
    const reader = new GoogleHealthReader();
    await reader.open(input, { tokenStore: memoryTokenStore({ 'wearer-1': tokens }), fetch: replay });
    return reader;
  }

  it('needs a window and a time zone, and reports an unknown type instead of failing', async () => {
    const reader = await opened();
    await expect(reader.read({ subjectKey: 's' })).rejects.toMatchObject({ code: 'validation', operation: 'read' });

    const { timeZone: _dropped, ...withoutZone } = (input as { config: Record<string, unknown> }).config;
    await expect(new GoogleHealthReader().open({ ...input, config: withoutZone })).rejects.toThrow(/timeZone/);

    const { issues } = await reader.read({ subjectKey: 's', window, types: ['steps', 'recovery'] });
    expect(issues.map((issue) => issue.code)).toContain('unknown-type');
  });

  it('reads through the host fetch, not the global one', async () => {
    const reader = await opened();
    const refuse: typeof fetch = () => Promise.reject(new Error('the global fetch must not be called'));
    const { bundle } = await withGlobalFetch(refuse, () => reader.read({ subjectKey: 's', window, types }));
    expect(bundle.entry?.length).toBeGreaterThan(1);
  });

  it('puts the window into the bundle key, so two windows never share an id', async () => {
    const reader = await opened();
    const read = (start: string, end: string) => reader.read({ subjectKey: 's', window: { start, end }, types });
    const first = await read(window.start, window.end);
    const second = await read('2026-07-08T00:00:00+02:00', '2026-07-10T00:00:00+02:00');
    expect(first.bundle.id).not.toBe(second.bundle.id);
  });
});
