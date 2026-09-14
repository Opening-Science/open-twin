import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patientUuid } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import { WhoopSyncPayloadSchema } from '../api/schemas/sync';
import { buildWhoopBundleFromPayload } from '../fhir/bundleBuilder';
import { CONNECTOR } from '../fhir/mappers/shared';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/whoop-sync.json');
const payload = WhoopSyncPayloadSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));

describe('WHOOP mappers', () => {
  const subjectKey = 'wearer-fixture-1';

  it('builds a collection bundle with Patient and Observations', () => {
    const bundle = buildWhoopBundleFromPayload(payload, {
      subjectKey,
      timestamp: '2026-07-26T10:00:00Z'
    });

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    const types = (bundle.entry ?? []).map((e) => e.resource?.resourceType);
    expect(types.filter((t) => t === 'Patient')).toHaveLength(1);
    expect(types.filter((t) => t === 'Observation').length).toBeGreaterThanOrEqual(5);
  });

  it('uses a deterministic subject when none is supplied', () => {
    const bundle = buildWhoopBundleFromPayload(payload, {
      subjectKey,
      timestamp: '2026-07-26T10:00:00Z'
    });
    const patient = bundle.entry?.find((e) => e.resource?.resourceType === 'Patient')?.resource;
    expect(patient?.id).toBe(patientUuid(CONNECTOR.connector, subjectKey));
  });
});
