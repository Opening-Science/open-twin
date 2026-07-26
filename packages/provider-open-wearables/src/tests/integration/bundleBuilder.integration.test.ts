import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Device, Observation, Patient } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { CONNECTOR } from '../../config/constants';
import { buildOpenWearablesBundle } from '../../fhir/bundleBuilder';
import { FIXTURE_USER_ID, SLEEP_PAGE, TIMESERIES_PAGE, WORKOUT_PAGE } from '../../fixtures/openWearablesSync';
import { openWearablesBundle } from '../../verification/exampleBundle';

const SYNC = {
  userId: FIXTURE_USER_ID,
  timeseries: TIMESERIES_PAGE,
  sleepSessions: SLEEP_PAGE,
  workouts: WORKOUT_PAGE
};

function resources<T extends { resourceType: string }>(type: string): T[] {
  const bundle = openWearablesBundle();
  return (bundle.entry ?? []).map((entry) => entry.resource).filter((r): r is T => r?.resourceType === type);
}

describe('buildOpenWearablesBundle', () => {
  it('maps every fixture record whose unit two primary sources agree on, and no others', () => {
    const observations = resources<Observation>('Observation');
    // 13 reproduced timeseries samples that map + 2 constructed ones + 2 sleep
    // sessions + 1 workout. The four reproduced samples this connector refuses are
    // not in that count, and that is the assertion.
    expect(observations).toHaveLength(18);
  });

  it('reports every refusal as an OperationOutcome issue instead of quietly shortening the bundle', () => {
    const { issues } = buildOpenWearablesBundle(SYNC, { timestamp: '2026-07-26T10:00:00Z' });
    const diagnostics = (issues?.issue ?? []).map((entry) => entry.diagnostics ?? '');
    expect(diagnostics.some((entry) => entry.includes('blood_pressure_systolic'))).toBe(true);
    expect(diagnostics.some((entry) => entry.includes('blood_alcohol_content'))).toBe(true);
    expect(diagnostics.some((entry) => entry.includes('walking_step_length'))).toBe(true);
    expect(diagnostics.some((entry) => entry.includes('recovery_score'))).toBe(true);
    expect(diagnostics.some((entry) => entry.includes('avg_pace_sec_per_km'))).toBe(true);
  });

  it('carries no reading, name or identifier from the payload into an issue diagnostic', () => {
    const { issues } = buildOpenWearablesBundle(SYNC, { timestamp: '2026-07-26T10:00:00Z' });
    for (const entry of issues?.issue ?? []) {
      const diagnostics = entry.diagnostics ?? '';
      expect(diagnostics).not.toContain(FIXTURE_USER_ID);
      expect(diagnostics).not.toContain('2024-01-01T08:00:00');
      expect(diagnostics).not.toContain('118');
    }
  });

  it('emits one Patient carrying an identifier and nothing it cannot vouch for (D1)', () => {
    const patients = resources<Patient>('Patient');
    expect(patients).toHaveLength(1);
    const patient = patients[0];
    expect(patient?.identifier?.[0]).toEqual({
      system: 'http://opentwin.ch/fhir/sid/open-wearables',
      value: FIXTURE_USER_ID
    });
    expect(patient?.name).toBeUndefined();
    expect(patient?.birthDate).toBeUndefined();
    expect(patient?.gender).toBeUndefined();
  });

  it('omits the Patient when the caller supplied a subject, and uses theirs verbatim', () => {
    const subject = { reference: 'Patient/known-to-the-integrator' };
    const { bundle } = buildOpenWearablesBundle(SYNC, { timestamp: '2026-07-26T10:00:00Z', subject });
    const kinds = (bundle.entry ?? []).map((entry) => entry.resource?.resourceType);
    expect(kinds).not.toContain('Patient');
    const observation = bundle.entry?.find((entry) => entry.resource?.resourceType === 'Observation')
      ?.resource as Observation;
    expect(observation.subject).toEqual(subject);
  });

  it('points every subject reference at a resource that is actually in the bundle', () => {
    const bundle = openWearablesBundle();
    const fullUrls = new Set((bundle.entry ?? []).map((entry) => entry.fullUrl));
    for (const entry of bundle.entry ?? []) {
      if (entry.resource?.resourceType !== 'Observation') continue;
      const observation = entry.resource as Observation;
      expect(fullUrls, 'subject').toContain(observation.subject?.reference);
      if (observation.device) expect(fullUrls, 'device').toContain(observation.device.reference);
    }
  });

  it('emits one Device per distinct provider and model seen in the sync', () => {
    const devices = resources<Device>('Device');
    // garmin/null, oura/null, apple/null from the timeseries samples, plus
    // oura/Oura Ring Gen3 and garmin/Garmin Fenix 7 from the events.
    const keys = devices.map((device) => `${device.manufacturer}|${device.deviceName?.[0]?.name ?? ''}`).sort();
    expect(keys).toEqual(['apple|', 'garmin|', 'garmin|Garmin Fenix 7', 'oura|', 'oura|Oura Ring Gen3']);
  });

  it('is byte-identical on a re-run, so a re-sync updates rather than duplicates (D2)', () => {
    expect(JSON.stringify(openWearablesBundle())).toBe(JSON.stringify(openWearablesBundle()));
  });

  it('gives every entry a lowercase UUID fullUrl matching its resource id', () => {
    // The HL7 validator reports a non-UUID in a urn:uuid fullUrl as an error.
    for (const entry of openWearablesBundle().entry ?? []) {
      expect(entry.fullUrl).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(entry.fullUrl).toBe(`urn:uuid:${entry.resource?.id}`);
    }
  });

  it('tags the bundle with the connector and version that produced it', () => {
    const tag = openWearablesBundle().meta?.tag?.[0];
    expect(tag?.code).toBe('open-wearables');
    const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../../../package.json'), 'utf8'));
    // A version tag that drifts from the package it names cannot tell output
    // produced before a correction from output produced after it.
    expect(tag?.version).toBe(manifest.version);
    expect(CONNECTOR.version).toBe(manifest.version);
  });

  it('maps the sections that parse when another section does not (D6)', () => {
    const { bundle, issues } = buildOpenWearablesBundle(
      { userId: FIXTURE_USER_ID, timeseries: TIMESERIES_PAGE, workouts: { data: [{ id: 'not-a-workout' }] } },
      { timestamp: '2026-07-26T10:00:00Z' }
    );
    const observations = (bundle.entry ?? []).filter((entry) => entry.resource?.resourceType === 'Observation');
    expect(observations.length).toBeGreaterThan(0);
    expect((issues?.issue ?? []).some((entry) => entry.code === 'invalid')).toBe(true);
  });

  it('returns an empty-but-valid bundle and no issues when there was simply no data', () => {
    const { bundle, issues } = buildOpenWearablesBundle(
      { userId: FIXTURE_USER_ID, timeseries: { data: [] }, sleepSessions: { data: [] }, workouts: { data: [] } },
      { timestamp: '2026-07-26T10:00:00Z' }
    );
    expect(issues).toBeUndefined();
    expect(bundle.entry).toHaveLength(1); // the Patient
  });

  it('accepts a bare array as well as the paginated envelope', () => {
    const { bundle } = buildOpenWearablesBundle(
      { userId: FIXTURE_USER_ID, workouts: (WORKOUT_PAGE as { data: unknown[] }).data },
      { timestamp: '2026-07-26T10:00:00Z' }
    );
    expect((bundle.entry ?? []).some((entry) => entry.resource?.resourceType === 'Observation')).toBe(true);
  });

  it('adds a PUT request per entry when asked for a transaction bundle', () => {
    const { bundle } = buildOpenWearablesBundle(SYNC, { timestamp: '2026-07-26T10:00:00Z', type: 'transaction' });
    expect(bundle.type).toBe('transaction');
    expect(bundle.entry?.[0]?.request?.method).toBe('PUT');
  });
});
