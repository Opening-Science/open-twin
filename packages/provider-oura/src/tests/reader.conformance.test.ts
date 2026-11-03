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
  replayFetch,
  withGlobalFetch
} from '@open-twin/reader-core/testing';
import { describe, expect, it } from 'vitest';
import { OURA_DESCRIPTOR, OuraReader } from '../reader';
import capture from './fixtures/sandbox-capture.json';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const captured = capture as Record<string, unknown>;
const CAPTURED_SCOPES = Object.keys(captured).sort();

const ACCESS_TOKEN = 'sandbox-access-token-0123456789abcdef';
const REFRESH_TOKEN = 'sandbox-refresh-token-0123456789abcdef';
const CLIENT_SECRET = 'test-client-secret-0123456789';
const tokens: StoredTokens = {
  accessToken: ACCESS_TOKEN,
  refreshToken: REFRESH_TOKEN,
  expiresAt: '2099-01-01T00:00:00Z'
};

/** The recorded sandbox for any window; a scope outside the capture is a 404, as the sandbox answers for personal_info. */
const replaySandbox = replayFetch((url) => {
  const scope = url.pathname.split('/').at(-1) ?? '';
  return url.pathname.startsWith('/v2/sandbox/usercollection/') ? captured[scope] : undefined;
});

const input: ReaderInput = {
  kind: 'api',
  sourceId: 'oura',
  config: {
    clientId: 'test-client',
    clientSecret: CLIENT_SECRET,
    redirectUri: 'https://example.org/callback',
    sandbox: true
  },
  tokenKey: 'wearer-1'
};
const window = { start: '2024-01-01T00:00:00+02:00', end: '2024-01-07T23:59:59+02:00' };

const fixture: ConformanceFixture = {
  name: 'sandbox capture, 13 scopes, one week',
  input,
  host: { tokenStore: memoryTokenStore({ 'wearer-1': tokens }), fetch: replaySandbox },
  request: { subjectKey: 'sandbox-subject', types: CAPTURED_SCOPES, window },
  expected: JSON.parse(readFileSync(join(FIXTURES, 'sandbox-capture.expected.json'), 'utf8')) as ExpectedSummary
};

describeReaderConformance(() => new OuraReader(), {
  descriptor: OURA_DESCRIPTOR,
  fixtures: [fixture],
  invalidInput: { ...input, config: { clientId: 'x' } },
  validate: validateFhir,
  secrets: { 'access token': ACCESS_TOKEN, 'refresh token': REFRESH_TOKEN, 'client secret': CLIENT_SECRET }
});

describeTokenBridge(() => new OuraReader(), { input, tokens, secret: CLIENT_SECRET });

describe('OuraReader beyond the shared suites', () => {
  async function opened(): Promise<OuraReader> {
    const reader = new OuraReader();
    await reader.open(input, { tokenStore: memoryTokenStore({ 'wearer-1': tokens }), fetch: replaySandbox });
    return reader;
  }

  it('rejects a window without an offset or with two different offsets, and accepts Z (D7)', async () => {
    const reader = await opened();
    const read = (start: string, end: string) =>
      withGlobalFetch(replaySandbox, () => reader.read({ subjectKey: 's', types: ['sleep'], window: { start, end } }));
    await expect(read('2024-01-01T00:00:00', '2024-01-02T00:00:00')).rejects.toMatchObject({
      code: 'validation',
      operation: 'read'
    });
    await expect(read('2024-01-01T00:00:00+02:00', '2024-01-02T00:00:00+01:00')).rejects.toMatchObject({
      code: 'validation'
    });
    await expect(read('2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')).resolves.toBeDefined();
  });

  it('reports an unknown type and a scope the sandbox cannot serve as issues and still returns the bundle (D6)', async () => {
    const reader = await opened();
    const { bundle, issues } = await withGlobalFetch(replaySandbox, () =>
      reader.read({ subjectKey: 'sandbox-subject', types: ['sleep', 'personal_info', 'not-a-scope'], window })
    );
    const codes = issues.map((i) => `${i.severity}:${i.code}`);
    expect(codes).toContain('warning:unknown-type');
    expect(codes).toContain('error:not-found');
    expect((bundle.entry ?? []).some((e) => e.resource?.resourceType === 'Observation')).toBe(true);
  });

  it('gives the same dates at different offsets different bundle ids', async () => {
    const reader = await opened();
    const read = (offset: string) =>
      withGlobalFetch(replaySandbox, () =>
        reader.read({
          subjectKey: 's',
          types: ['sleep'],
          window: { start: `2024-01-01T00:00:00${offset}`, end: `2024-01-02T00:00:00${offset}` }
        })
      );
    expect((await read('+02:00')).bundle.id).not.toBe((await read('-05:00')).bundle.id);
  });
});
