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
import { WHOOP_DESCRIPTOR, WhoopReader } from '../reader';
import { replayWhoop } from './support';

const ACCESS_TOKEN = 'whoop-access-token-0123456789abcdef';
const REFRESH_TOKEN = 'whoop-refresh-token-0123456789abcdef';
const CLIENT_SECRET = 'whoop-client-secret-0123456789';
const tokens: StoredTokens = {
  accessToken: ACCESS_TOKEN,
  refreshToken: REFRESH_TOKEN,
  expiresAt: '2099-01-01T00:00:00Z'
};

const input: ReaderInput = {
  kind: 'api',
  sourceId: 'whoop',
  config: { clientId: 'test-client', clientSecret: CLIENT_SECRET, redirectUri: 'https://example.org/callback' },
  tokenKey: 'wearer-1'
};
const window = { start: '2026-06-19T00:00:00+02:00', end: '2026-06-21T00:00:00+02:00' };
const replay = replayWhoop();

const fixture: ConformanceFixture = {
  name: 'recorded sync, one recovery, one cycle, one sleep',
  input,
  host: { tokenStore: memoryTokenStore({ 'wearer-1': tokens }), fetch: replay },
  request: { subjectKey: 'whoop-exemplar-wearer', window },
  expected: JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', 'whoop-sync.expected.json'), 'utf8')
  ) as ExpectedSummary
};

describeReaderConformance(() => new WhoopReader(), {
  descriptor: WHOOP_DESCRIPTOR,
  fixtures: [fixture],
  invalidInput: { ...input, config: { clientId: 'x' } },
  validate: validateFhir,
  secrets: { 'access token': ACCESS_TOKEN, 'refresh token': REFRESH_TOKEN, 'client secret': CLIENT_SECRET }
});

describeTokenBridge(() => new WhoopReader(), { input, tokens, secret: CLIENT_SECRET });

describe('WhoopReader beyond the shared suites', () => {
  async function opened(): Promise<WhoopReader> {
    const reader = new WhoopReader();
    await reader.open(input, { tokenStore: memoryTokenStore({ 'wearer-1': tokens }), fetch: replay });
    return reader;
  }

  it('needs a window, and reports a narrower or unknown types request instead of applying it', async () => {
    const reader = await opened();
    await expect(reader.read({ subjectKey: 's' })).rejects.toMatchObject({ code: 'validation', operation: 'read' });
    const { issues } = await withGlobalFetch(replay, () =>
      reader.read({ subjectKey: 's', window, types: ['sleep', 'steps'] })
    );
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(['unknown-type', 'types-not-applied']));
  });

  it('puts the window into the bundle key, so two windows never share an id', async () => {
    const reader = await opened();
    const read = (start: string, end: string) =>
      withGlobalFetch(replay, () => reader.read({ subjectKey: 's', window: { start, end } }));
    const first = await read(window.start, window.end);
    const second = await read('2026-06-21T00:00:00+02:00', '2026-06-23T00:00:00+02:00');
    expect(first.bundle.id).not.toBe(second.bundle.id);
  });
});
