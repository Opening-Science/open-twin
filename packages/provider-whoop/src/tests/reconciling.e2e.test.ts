import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { validateFhir } from '@open-twin/fhir-r4';
import { OuraReader } from '@open-twin/provider-oura';
import {
  type HostServices,
  type IHealthDataReader,
  ReconcilingReader,
  type StoredTokens
} from '@open-twin/reader-core';
import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { WhoopReader } from '../reader';
import { replayWhoop } from './reader.conformance.test';

/**
 * The real Oura and WHOOP readers on their recorded fixtures, reconciled by the wrapper.
 * The Oura sandbox is a week in January 2024; the WHOOP fixture is one night in June
 * 2026, so its dates are shifted onto the second Oura day to make an overlap. Nothing
 * else about either fixture changes.
 */
const require = createRequire(import.meta.url);
// The Oura package exports only its entry point, so the fixture path is found from there.
const ouraFixtures = join(dirname(require.resolve('@open-twin/provider-oura')), '..', 'src', 'tests', 'fixtures');
const ouraCapture = JSON.parse(readFileSync(join(ouraFixtures, 'sandbox-capture.json'), 'utf8')) as Record<
  string,
  unknown
>;
const whoopSync = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'whoop-sync.json'), 'utf8')) as Record<
  string,
  unknown[]
>;

const WINDOW = { start: '2024-01-01T00:00:00+02:00', end: '2024-01-07T23:59:59+02:00' };
const NOW = '2026-01-01T00:00:00Z';
const TOKEN = 'test-token-0123456789';

function shifted(): Record<string, unknown[]> {
  const text = JSON.stringify(whoopSync).replaceAll('2026-06-19', '2024-01-01').replaceAll('2026-06-20', '2024-01-02');
  return JSON.parse(text) as Record<string, unknown[]>;
}

const replayOura: typeof fetch = (input) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const scope = url.pathname.split('/').at(-1) ?? '';
  const hit = url.pathname.startsWith('/v2/sandbox/usercollection/') && scope in ouraCapture;
  return Promise.resolve(new Response(hit ? JSON.stringify(ouraCapture[scope]) : '{}', { status: hit ? 200 : 404 }));
};

const tokens: StoredTokens = { accessToken: TOKEN, refreshToken: 'r', expiresAt: '2099-01-01T00:00:00Z' };
const hostWith = (fetchImpl: typeof fetch): HostServices => ({
  now: () => NOW,
  fetch: fetchImpl,
  tokenStore: { load: () => Promise.resolve(tokens), save: () => Promise.resolve(), clear: () => Promise.resolve() }
});

async function readBoth() {
  const oura = new OuraReader();
  await oura.open(
    {
      kind: 'api',
      sourceId: 'oura',
      config: { clientId: 'c', clientSecret: 's', redirectUri: 'https://example.org/cb', sandbox: true },
      tokenKey: 'w'
    },
    hostWith(replayOura)
  );
  const whoop = new WhoopReader();
  const whoopFetch = replayWhoop(shifted());
  await whoop.open(
    {
      kind: 'api',
      sourceId: 'whoop',
      config: { clientId: 'c', clientSecret: 's', redirectUri: 'https://example.org/cb' },
      tokenKey: 'w'
    },
    hostWith(whoopFetch)
  );
  // Both providers call the global fetch; route by host.
  const previous = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return href.includes('ouraring.com') ? replayOura(input, init) : whoopFetch(input, init);
  };
  try {
    const reader = new ReconcilingReader([oura, whoop] as IHealthDataReader[]);
    await reader.open({ kind: 'api', sourceId: 'open-twin', config: {} }, { now: () => NOW });
    return await reader.read({ subjectKey: 'one-wearer', window: WINDOW });
  } finally {
    globalThis.fetch = previous;
  }
}

const observations = (bundle: { entry?: Array<{ resource?: { resourceType: string } }> }) =>
  (bundle.entry ?? []).map((e) => e.resource).filter((r): r is Observation => r?.resourceType === 'Observation');

describe('Oura and WHOOP reconciled end to end', () => {
  it('carries every source Observation under one subject and validates; no measure is shared yet (#243)', async () => {
    const result = await readBoth();
    const all = observations(result.bundle);
    const bySource = new Map<string, number>();
    for (const o of all.filter((o) => o.derivedFrom === undefined)) {
      const tag = o.meta?.tag?.find((t) => t.system === 'http://opentwin.ch/fhir/CodeSystem/connector')?.code ?? '?';
      bySource.set(tag, (bySource.get(tag) ?? 0) + 1);
    }
    expect(bySource.get('oura')).toBeGreaterThan(0);
    expect(bySource.get('whoop')).toBeGreaterThan(0);
    expect(result.sources.map((s) => s.reader.id)).toEqual(['oura', 'whoop']);

    // Oura carries its sleep and activity measures as components of panel Observations,
    // which the aggregator does not read (#243), so the two sources share no measure it
    // can see. Until that is settled the honest assertion is: nothing reconciled, nothing lost.
    expect(result.reconciliations).toEqual([]);
    expect(all.some((o) => o.derivedFrom !== undefined)).toBe(false);

    const outcome = validateFhir(result.bundle);
    expect(outcome.issues.filter((i) => i.severity === 'error' || i.severity === 'fatal')).toEqual([]);
    expect(new Set(all.map((o) => o.subject?.reference)).size).toBe(1);
    expect(JSON.stringify(result.issues)).not.toContain(TOKEN);
  });
});
