import {
  auditMeasurementDeclarations,
  declarationAddress,
  type MeasurementDeclarationSet,
  matchDeclarations,
  SYSTEMS,
  validateMeasurementDeclarations
} from '@open-twin/fhir-core';
import type { FhirResource, Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { OPEN_WEARABLES_SYSTEM } from '../config/constants';
import { buildOpenWearablesBundle } from '../fhir/bundleBuilder';
import { identifyingCoding, OPEN_WEARABLES_MEASUREMENTS as SET } from '../fhir/measurements';
import { SERIES_MAP } from '../fhir/seriesMap';
import { COVERAGE_TIMESERIES_PAGE, COVERAGE_WORKOUT_PAGE } from '../fixtures/measurementCoverage';
import { FIXTURE_USER_ID, SLEEP_PAGE, TIMESERIES_PAGE, WORKOUT_PAGE } from '../fixtures/openWearablesSync';

const TIMESTAMP = '2026-07-26T10:00:00Z';

/** Everything the connector emits for the reproduced fixtures and the constructed coverage fixture. */
function emitted(): FhirResource[] {
  const bundles = [
    buildOpenWearablesBundle(
      { userId: FIXTURE_USER_ID, timeseries: TIMESERIES_PAGE, sleepSessions: SLEEP_PAGE, workouts: WORKOUT_PAGE },
      { timestamp: TIMESTAMP }
    ).bundle,
    buildOpenWearablesBundle(
      { userId: FIXTURE_USER_ID, timeseries: COVERAGE_TIMESERIES_PAGE, workouts: COVERAGE_WORKOUT_PAGE },
      { timestamp: TIMESTAMP }
    ).bundle
  ];
  return bundles.flatMap((bundle) =>
    (bundle.entry ?? []).flatMap((entry) => (entry.resource ? [entry.resource as FhirResource] : []))
  );
}

function observations(): Observation[] {
  return emitted().filter((resource): resource is Observation => resource.resourceType === 'Observation');
}

function withCode(code: string): Observation[] {
  return observations().filter((observation) => observation.code.coding?.some((coding) => coding.code === code));
}

const measures = Object.entries(SERIES_MAP).flatMap(([type, mapping]) => [
  { type, measure: mapping.sample },
  ...(mapping.dailyTotal ? [{ type: `${type} (daily total)`, measure: mapping.dailyTotal }] : [])
]);

describe('OPEN_WEARABLES_MEASUREMENTS', () => {
  it('is internally consistent against the shared definitions', () => {
    expect(validateMeasurementDeclarations(SET)).toEqual([]);
  });

  it('declares the connector id, a version and complete coverage', () => {
    expect(SET.connector).toBe('open-wearables');
    expect(SET.version).toBe(1);
    expect(SET.coverage).toBe('complete');
  });

  it('declares every SERIES_MAP measure, sample and daily total, exactly once at the observation', () => {
    // SERIES_MAP is a closed table: a type absent from it is refused, never emitted.
    for (const { type, measure } of measures) {
      const address = declarationAddress({ coding: identifyingCoding(measure), location: { kind: 'observation' } });
      const found = SET.declarations.filter((declaration) => declarationAddress(declaration) === address);
      expect(found, type).toHaveLength(1);
      expect(found[0]?.unit, type).toBe(measure.unit.code);
    }
  });

  it('never identifies a series measure by a coding another emitted measurement also carries', () => {
    // 8867-4 is carried by heart_rate and resting_heart_rate, 2708-6 is the oxygensat
    // magic code, and 55411-3 is carried by exercise_time and every workout.
    const declared = new Set(
      SET.declarations.map((declaration) => `${declaration.coding.system}|${declaration.coding.code}`)
    );
    for (const code of ['8867-4', '2708-6', '55411-3']) {
      expect(declared.has(`${SYSTEMS.LOINC}|${code}`), code).toBe(false);
    }
  });

  it('exercises every SERIES_MAP type in the coverage fixture', () => {
    const data = (COVERAGE_TIMESERIES_PAGE as { data: { type: string; is_daily_total: boolean | null }[] }).data;
    const samples = new Set(data.filter((entry) => entry.is_daily_total !== true).map((entry) => entry.type));
    const daily = new Set(data.filter((entry) => entry.is_daily_total === true).map((entry) => entry.type));
    expect([...samples].sort()).toEqual(Object.keys(SERIES_MAP).sort());
    expect([...daily].sort()).toEqual(
      Object.entries(SERIES_MAP)
        .filter(([, mapping]) => mapping.dailyTotal)
        .map(([type]) => type)
        .sort()
    );
  });

  it('maps every coverage sample, so nothing is audited by omission', () => {
    const { bundle, issues } = buildOpenWearablesBundle(
      { userId: FIXTURE_USER_ID, timeseries: COVERAGE_TIMESERIES_PAGE, workouts: COVERAGE_WORKOUT_PAGE },
      { timestamp: TIMESTAMP }
    );
    expect(issues).toBeUndefined();
    const count = (bundle.entry ?? []).filter((entry) => entry.resource?.resourceType === 'Observation').length;
    expect(count).toBe((COVERAGE_TIMESERIES_PAGE as { data: unknown[] }).data.length + 1);
  });

  it('matches every emitted Observation and component to exactly one declaration, and exercises every declaration', () => {
    const audit = auditMeasurementDeclarations(SET, emitted());
    expect(audit.issues).toEqual([]);
    expect(audit.unexercised).toEqual([]);
  });

  it('tells a heart rate reading from a resting heart rate though both carry LOINC 8867-4', () => {
    const [reading] = observations().filter(
      (observation) =>
        observation.code.coding?.[0]?.code === '8867-4' && observation.effectiveDateTime?.startsWith('2024-03-04')
    );
    const [resting] = withCode('40443-4');
    expect(reading && matchDeclarations(reading, SET.declarations).observation.map((d) => d.key)).toEqual([
      'heart-rate'
    ]);
    expect(resting && matchDeclarations(resting, SET.declarations).observation.map((d) => d.key)).toEqual([
      'open-wearables:resting-heart-rate'
    ]);
  });

  it('tells an exercise_time sample from a workout though both carry LOINC 55411-3', () => {
    const keys = withCode('55411-3').map((observation) =>
      matchDeclarations(observation, SET.declarations).observation.map((declaration) => declaration.key)
    );
    expect(keys).toContainEqual(['open-wearables:exercise-time']);
    expect(keys).toContainEqual(['exercise-duration']);
    expect(keys.every((found) => found.length === 1)).toBe(true);
  });

  it('matches an oxygen saturation Observation once although it carries two LOINC codings', () => {
    for (const observation of withCode('59408-5')) {
      expect(matchDeclarations(observation, SET.declarations).observation.map((d) => d.key)).toEqual([
        'oxygen-saturation'
      ]);
    }
  });
});

describe('the audit catches a declaration that does not describe the output', () => {
  const without = (predicate: (code: string) => boolean): MeasurementDeclarationSet => ({
    ...SET,
    declarations: SET.declarations.filter((declaration) => !predicate(declaration.coding.code))
  });

  it('reports an Observation with no declaration as undeclared', () => {
    const audit = auditMeasurementDeclarations(
      without((code) => code === 'heart-rate'),
      emitted()
    );
    expect(audit.issues.some((issue) => issue.code === 'undeclared' && issue.location === 'observation')).toBe(true);
    expect(audit.issues.every((issue) => issue.codings.includes(`${OPEN_WEARABLES_SYSTEM}|heart-rate`))).toBe(true);
  });

  it('reports a component with no declaration as undeclared', () => {
    const audit = auditMeasurementDeclarations(
      without((code) => code === 'sleep-efficiency'),
      emitted()
    );
    expect(audit.issues.map((issue) => [issue.code, issue.location])).toContainEqual(['undeclared', 'component']);
  });

  it('reports a declaration on the shared magic code 8867-4 as ambiguous', () => {
    const [heartRate] = SET.declarations.filter((declaration) => declaration.key === 'heart-rate');
    const broken: MeasurementDeclarationSet = {
      ...SET,
      declarations: [
        ...SET.declarations.filter((declaration) => declaration.key !== 'heart-rate'),
        ...(heartRate ? [{ ...heartRate, coding: { system: SYSTEMS.LOINC, code: '8867-4' } }] : [])
      ]
    };
    const audit = auditMeasurementDeclarations(broken, emitted());
    expect(audit.issues.some((issue) => issue.code === 'ambiguous')).toBe(true);
  });

  it('reports a declared unit the mapper does not emit as a unit mismatch', () => {
    const broken: MeasurementDeclarationSet = {
      ...SET,
      declarations: SET.declarations.map((declaration) =>
        declaration.key === 'open-wearables:skin-temperature-deviation' ? { ...declaration, unit: 'Cel' } : declaration
      )
    };
    const audit = auditMeasurementDeclarations(broken, emitted());
    expect(audit.issues.length).toBeGreaterThan(0);
    expect(audit.issues.every((issue) => issue.code === 'unit-mismatch')).toBe(true);
  });
});
