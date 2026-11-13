/**
 * WHAT: Audits WHOOP_MEASUREMENTS against bundles built by the real WHOOP parsers, mappers and bundle builder.
 * NOT:  Must not call the live WHOOP API; whether a declared key means what WHOOP measures is a review question, not something this test settles.
 * GOVERNED BY: DECISIONS.md#d18
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditMeasurementDeclarations,
  declarationAddress,
  declareMeasurement,
  LOINC_CODINGS,
  SYSTEMS,
  validateMeasurementDeclarations
} from '@open-twin/fhir-core';
import type { Bundle, FhirResource, Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { WhoopSyncPayloadSchema } from '../api/schemas/sync';
import { buildWhoopBundleFromPayload } from '../fhir/bundleBuilder';
import { CYCLE_CODINGS } from '../fhir/mappers/cycle';
import { RECOVERY_CODINGS } from '../fhir/mappers/recovery';
import { WHOOP_MEASUREMENTS } from '../index';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/whoop-sync.json');
const options = { subjectKey: 'wearer-fixture-1', timestamp: '2026-07-26T10:00:00Z' };

function bundleFrom(raw: unknown): Bundle {
  return buildWhoopBundleFromPayload(WhoopSyncPayloadSchema.parse(raw), options);
}

// The recorded fixture carries every score field the mappers read. The second payload adds
// a nap (skipped by the sleep mapper) and unmapped fields, so neither may emit anything undeclared.
const fixture = WhoopSyncPayloadSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
const extended = {
  recovery: [
    ...fixture.recovery,
    {
      cycle_id: 102,
      sleep_id: 'sleep-bbb',
      score_state: 'SCORED',
      created_at: '2026-06-21T07:40:00.000Z',
      score: {
        recovery_score: 41,
        resting_heart_rate: 61,
        hrv_rmssd_milli: 33.8,
        spo2_percentage: 95.1,
        skin_temp_celsius: 33.4
      }
    }
  ],
  cycles: [
    ...fixture.cycles,
    {
      id: 102,
      start: '2026-06-20T22:30:00.000Z',
      end: '2026-06-21T22:10:00.000Z',
      score_state: 'SCORED',
      score: { strain: 9.1, kilojoule: 8_400, average_heart_rate: 61, max_heart_rate: 152 }
    }
  ],
  sleep: [
    ...fixture.sleep,
    {
      id: 'sleep-bbb',
      cycle_id: 102,
      start: '2026-06-20T22:30:00.000Z',
      end: '2026-06-21T06:50:00.000Z',
      nap: false,
      score_state: 'SCORED',
      score: {
        respiratory_rate: 15.2,
        sleep_performance_percentage: 78,
        sleep_consistency_percentage: 70,
        sleep_efficiency_percentage: 88.4,
        stage_summary: {
          total_in_bed_time_milli: 30_000_000,
          total_awake_time_milli: 3_480_000,
          total_light_sleep_time_milli: 13_200_000,
          total_slow_wave_sleep_time_milli: 6_000_000,
          total_rem_sleep_time_milli: 7_320_000,
          disturbance_count: 9
        }
      }
    },
    {
      id: 'nap-1',
      start: '2026-06-21T14:00:00.000Z',
      end: '2026-06-21T14:30:00.000Z',
      nap: true,
      score: { sleep_performance_percentage: 50, stage_summary: { total_in_bed_time_milli: 1_800_000 } }
    }
  ]
};

const fixtureBundle = bundleFrom(fixture);
const bundles = [fixtureBundle, bundleFrom(extended)];

function resourcesOf(bundle: Bundle): FhirResource[] {
  return (bundle.entry ?? []).flatMap((entry) => (entry.resource ? [entry.resource as FhirResource] : []));
}

function observationsOf(bundle: Bundle): Observation[] {
  return resourcesOf(bundle).filter((resource): resource is Observation => resource.resourceType === 'Observation');
}

describe('WHOOP_MEASUREMENTS', () => {
  it('is consistent with the shared definitions', () => {
    expect(validateMeasurementDeclarations(WHOOP_MEASUREMENTS)).toEqual([]);
  });

  it('declares every Observation and component the mappers emit, exactly once', () => {
    for (const bundle of bundles) {
      expect(observationsOf(bundle).length).toBeGreaterThan(0);
      expect(auditMeasurementDeclarations(WHOOP_MEASUREMENTS, bundle).issues).toEqual([]);
    }
  });

  it('has every declaration exercised by real mapper output', () => {
    const audit = auditMeasurementDeclarations(WHOOP_MEASUREMENTS, bundles.flatMap(resourcesOf));
    expect(audit.issues).toEqual([]);
    expect(audit.unexercised).toEqual([]);
  });

  it('tells the two heart rates apart by their WHOOP codings, not by LOINC 8867-4', () => {
    const keyAt = (coding: { system: string; code: string }) =>
      WHOOP_MEASUREMENTS.declarations.find(
        (d) => declarationAddress(d) === declarationAddress({ coding, location: { kind: 'observation' } })
      )?.key;
    expect(keyAt(RECOVERY_CODINGS.RESTING_HEART_RATE)).toBe('whoop:recovery.resting-heart-rate');
    expect(keyAt(CYCLE_CODINGS.AVERAGE_HEART_RATE)).toBe('whoop:cycle.average-heart-rate');
    expect(keyAt(LOINC_CODINGS.HEART_RATE)).toBeUndefined();

    const matches = auditMeasurementDeclarations(WHOOP_MEASUREMENTS, fixtureBundle).matches;
    for (const coding of [RECOVERY_CODINGS.RESTING_HEART_RATE, CYCLE_CODINGS.AVERAGE_HEART_RATE]) {
      expect(matches.get(declarationAddress({ coding, location: { kind: 'observation' } }))).toBe(1);
    }
  });

  it('reports an undeclared value when a declaration is removed', () => {
    const set = {
      ...WHOOP_MEASUREMENTS,
      declarations: WHOOP_MEASUREMENTS.declarations.filter((d) => d.key !== 'whoop:recovery.resting-heart-rate')
    };
    const issues = auditMeasurementDeclarations(set, fixtureBundle).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'undeclared', location: 'observation' });
    expect(issues[0]?.codings).toContain(`${SYSTEMS.WHOOP}|recovery-resting-heart-rate`);
  });

  it('reports ambiguity when LOINC 8867-4 itself is declared as a heart rate reading', () => {
    const set = {
      ...WHOOP_MEASUREMENTS,
      declarations: [...WHOOP_MEASUREMENTS.declarations, declareMeasurement('heart-rate', LOINC_CODINGS.HEART_RATE)]
    };
    const ambiguous = auditMeasurementDeclarations(set, fixtureBundle).issues.filter((i) => i.code === 'ambiguous');
    expect(ambiguous).toHaveLength(2);
  });

  it('reports a unit mismatch when a declaration names a unit the mapper does not emit', () => {
    const set = {
      ...WHOOP_MEASUREMENTS,
      declarations: WHOOP_MEASUREMENTS.declarations.map((d) => (d.key === 'time-in-bed' ? { ...d, unit: 'ms' } : d))
    };
    const issues = auditMeasurementDeclarations(set, fixtureBundle).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'unit-mismatch', codings: [`${SYSTEMS.LOINC}|103213-5`] });
  });
});
