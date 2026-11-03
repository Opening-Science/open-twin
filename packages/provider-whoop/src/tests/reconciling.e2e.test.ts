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
import { memoryTokenStore, replayFetch, withGlobalFetch } from '@open-twin/reader-core/testing';
import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { WhoopReader } from '../reader';
import { replayWhoop, whoopSync } from './support';

/**
 * The real Oura and WHOOP readers on their recorded fixtures through the wrapper. The
 * Oura sandbox is a week in January 2024; the WHOOP night is shifted onto its second day.
 */
const require = createRequire(import.meta.url);
const ouraPackage = join(dirname(require.resolve('@open-twin/provider-oura')), '..');
const ouraCapture = JSON.parse(
  readFileSync(join(ouraPackage, 'src', 'tests', 'fixtures', 'sandbox-capture.json'), 'utf8')
) as Record<string, unknown>;

const WINDOW = { start: '2024-01-01T00:00:00+02:00', end: '2024-01-07T23:59:59+02:00' };
const NOW = '2026-01-01T00:00:00Z';
const TOKEN = 'test-token-0123456789';
const tokens: StoredTokens = { accessToken: TOKEN, refreshToken: 'r', expiresAt: '2099-01-01T00:00:00Z' };

const replayOura = replayFetch((url) => {
  const scope = url.pathname.split('/').at(-1) ?? '';
  return url.pathname.startsWith('/v2/sandbox/usercollection/') ? ouraCapture[scope] : undefined;
});
const shiftedWhoop = JSON.parse(
  JSON.stringify(whoopSync()).replaceAll('2026-06-19', '2024-01-01').replaceAll('2026-06-20', '2024-01-02')
) as Record<string, unknown[]>;
const replay = replayWhoop(shiftedWhoop);
const byHost: typeof fetch = (input, init) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return href.includes('ouraring.com') ? replayOura(input, init) : replay(input, init);
};
const host: HostServices = { now: () => NOW, fetch: byHost, tokenStore: memoryTokenStore({ w: tokens }) };

async function readBoth() {
  const oura = new OuraReader();
  await oura.open(
    {
      kind: 'api',
      sourceId: 'oura',
      config: { clientId: 'c', clientSecret: 's', redirectUri: 'https://example.org/cb', sandbox: true },
      tokenKey: 'w'
    },
    host
  );
  const whoop = new WhoopReader();
  await whoop.open(
    {
      kind: 'api',
      sourceId: 'whoop',
      config: { clientId: 'c', clientSecret: 's', redirectUri: 'https://example.org/cb' },
      tokenKey: 'w'
    },
    host
  );
  const reader = new ReconcilingReader([oura, whoop] as IHealthDataReader[]);
  await reader.open({ kind: 'api', sourceId: 'open-twin', config: {} }, host);
  return withGlobalFetch(byHost, () => reader.read({ subjectKey: 'one-wearer', window: WINDOW }));
}

describe('Oura and WHOOP reconciled end to end', () => {
  it('carries every source Observation under one subject and validates; no measure is shared yet (#243)', async () => {
    const result = await readBoth();
    const all = (result.bundle.entry ?? [])
      .map((e) => e.resource)
      .filter((r): r is Observation => r?.resourceType === 'Observation');
    const tagOf = (o: Observation) =>
      o.meta?.tag?.find((t) => t.system === 'http://opentwin.ch/fhir/CodeSystem/connector')?.code;
    expect(all.some((o) => tagOf(o) === 'oura')).toBe(true);
    expect(all.some((o) => tagOf(o) === 'whoop')).toBe(true);
    expect(result.sources.map((s) => s.reader.id)).toEqual(['oura', 'whoop']);
    expect(new Set(all.map((o) => o.subject?.reference)).size).toBe(1);

    // Oura carries its sleep and activity measures as components the aggregator does not
    // read (#243), so nothing reconciles yet: nothing selected, nothing lost.
    expect(result.reconciliations).toEqual([]);
    expect(all.some((o) => o.derivedFrom !== undefined)).toBe(false);

    const outcome = validateFhir(result.bundle);
    expect(outcome.issues.filter((i) => i.severity === 'error' || i.severity === 'fatal')).toEqual([]);
    expect(JSON.stringify(result.issues)).not.toContain(TOKEN);
  });
});
