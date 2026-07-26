import { SYSTEMS } from '@open-twin/fhir-core';
import type { Reference } from 'fhir/r4';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TimeSeriesSample } from '../../api/schemas/timeseries';
import { IssueLog } from '../../fhir/issues';
import { DeviceRegistry } from '../../fhir/mappers/device';
import { mapTimeSeriesSample, type SampleContext } from '../../fhir/mappers/timeseries';

const SUBJECT: Reference = { reference: 'Patient/subject-under-test' };
const SUBJECT_KEY = '00000000-0000-0000-0000-000000000002';

let context: SampleContext;

beforeEach(() => {
  context = {
    subject: SUBJECT,
    subjectKey: SUBJECT_KEY,
    devices: new DeviceRegistry(SUBJECT_KEY),
    issues: new IssueLog()
  };
});

function sample(overrides: Partial<TimeSeriesSample> = {}): TimeSeriesSample {
  return {
    timestamp: '2024-01-01T08:00:00+00:00',
    zone_offset: '+00:00',
    type: 'heart_rate',
    value: 72,
    unit: 'bpm',
    source: { provider: 'garmin', device: 'Garmin Fenix 7' },
    is_daily_total: null,
    ...overrides
  };
}

describe('mapTimeSeriesSample', () => {
  it('emits heart rate under LOINC 8867-4 in /min, the unit the R4 profile fixes', () => {
    const observation = mapTimeSeriesSample(sample(), context);
    expect(observation?.code.coding?.[0]).toEqual({
      system: SYSTEMS.LOINC,
      code: '8867-4',
      display: 'Heart rate'
    });
    expect(observation?.valueQuantity).toEqual({
      value: 72,
      unit: 'per minute',
      system: SYSTEMS.UCUM,
      code: '/min'
    });
    // `{beats}/min` is absent from ucum-vitals-common, so a vital-signs
    // Observation carrying it is a conformance failure, not a labelling nicety.
    expect(observation?.valueQuantity?.code).not.toBe('{beats}/min');
    expect(observation?.meta?.profile).toContain('http://hl7.org/fhir/StructureDefinition/heartrate');
  });

  it('accepts the unit spelling the API sends and the one the example payloads send', () => {
    // series_types.py declares "percent"; the platform's own example payload for
    // the same series type sends "%".
    for (const unit of ['percent', '%']) {
      const observation = mapTimeSeriesSample(sample({ type: 'oxygen_saturation', unit, value: 97 }), context);
      expect(observation?.valueQuantity, unit).toEqual({
        value: 97,
        unit: '%',
        system: SYSTEMS.UCUM,
        code: '%'
      });
    }
  });

  it('carries the LOINC code each R4 vital-signs profile requires alongside the precise one', () => {
    // Found by running the HL7 validator, not by reading the specification. The
    // oxygensat profile requires 2708-6 and the validator applies heartrate to
    // 40443-4 and then demands 8867-4. Dropping either coding fails validation;
    // dropping the specific one loses what the reading actually is.
    const spo2 = mapTimeSeriesSample(sample({ type: 'oxygen_saturation', unit: 'percent', value: 97 }), context);
    expect(spo2?.code.coding?.map((coding) => coding.code)).toEqual(['59408-5', '2708-6']);

    const resting = mapTimeSeriesSample(sample({ type: 'resting_heart_rate', unit: 'bpm', value: 52 }), context);
    expect(resting?.code.coding?.map((coding) => coding.code)).toEqual(['40443-4', '8867-4']);
    expect(resting?.meta?.profile).toContain('http://hl7.org/fhir/StructureDefinition/heartrate');
  });

  it('refuses a sample whose unit is not one a primary source records for that type', () => {
    // A SpO2 of 0.97 under an unrecognised unit is a hundredfold error waiting to
    // happen, and there is no way to tell it from a genuine 0.97% from the payload.
    const observation = mapTimeSeriesSample(sample({ type: 'oxygen_saturation', unit: 'ratio', value: 0.97 }), context);
    expect(observation).toBeUndefined();
    expect(context.issues.errors()).toHaveLength(1);
    expect(context.issues.errors()[0]?.toString()).toContain('oxygen_saturation');
  });

  it('refuses a series type whose two primary sources disagree, and says which', () => {
    const observation = mapTimeSeriesSample(
      sample({ type: 'blood_alcohol_content', unit: 'g/dL', value: 0.08 }),
      context
    );
    expect(observation).toBeUndefined();
    const diagnostics = context.issues.errors()[0]?.toString() ?? '';
    expect(diagnostics).toContain('blood_alcohol_content');
    expect(diagnostics).toContain('unit-conflict');
    // The refusal must not carry the reading itself into a log line.
    expect(diagnostics).not.toContain('0.08');
  });

  it('refuses a series type it has never heard of instead of guessing a unit', () => {
    // `recovery_score` is listed in the published docs and in the example payloads
    // but is absent from the SeriesType enum the API actually validates against.
    const observation = mapTimeSeriesSample(sample({ type: 'recovery_score', unit: 'score', value: 78 }), context);
    expect(observation).toBeUndefined();
    expect(context.issues.errors()[0]?.toString()).toContain('recovery_score');
  });

  it('deduplicates issues so one unmappable type is one problem, not one per sample', () => {
    for (let index = 0; index < 50; index++) {
      mapTimeSeriesSample(sample({ type: 'blood_pressure_systolic', unit: 'mmHg', value: 118 }), context);
    }
    expect(context.issues.errors()).toHaveLength(1);
  });

  it('switches code and denominator for a daily total', () => {
    const perSample = mapTimeSeriesSample(sample({ type: 'steps', unit: 'count', value: 8432 }), context);
    const daily = mapTimeSeriesSample(
      sample({ type: 'steps', unit: 'count', value: 8432, is_daily_total: true }),
      context
    );
    expect(perSample?.code.coding?.[0]?.code).toBe('55423-8');
    expect(perSample?.valueQuantity?.code).toBe('{steps}');
    expect(daily?.code.coding?.[0]?.code).toBe('41950-7');
    expect(daily?.valueQuantity?.code).toBe('{steps}/d');
    // Same reading, same instant, different assertion: the ids must differ or a
    // re-sync will overwrite one with the other.
    expect(perSample?.id).not.toBe(daily?.id);
  });

  it('refuses a daily total for a type that has no agreed 24-hour concept', () => {
    const observation = mapTimeSeriesSample(
      sample({ type: 'heart_rate', unit: 'bpm', value: 72, is_daily_total: true }),
      context
    );
    expect(observation).toBeUndefined();
    expect(context.issues.errors()[0]?.toString()).toContain('is_daily_total');
  });

  it('carries the subject local offset into effectiveDateTime (D7)', () => {
    const observation = mapTimeSeriesSample(
      sample({ timestamp: '2024-01-01T22:30:00+00:00', zone_offset: '+02:00' }),
      context
    );
    expect(observation?.effectiveDateTime).toBe('2024-01-02T00:30:00+02:00');
  });

  it('gives two providers reporting the same instant two distinct resources', () => {
    const oura = mapTimeSeriesSample(sample({ source: { provider: 'oura', device: 'Oura Ring Gen3' } }), context);
    const garmin = mapTimeSeriesSample(sample({ source: { provider: 'garmin', device: 'Garmin Fenix 7' } }), context);
    expect(oura?.id).not.toBe(garmin?.id);
    expect(oura?.device?.reference).not.toBe(garmin?.device?.reference);
    expect(context.devices.devices()).toHaveLength(2);
  });

  it('reuses one Device across every sample from the same source', () => {
    for (let index = 0; index < 10; index++) mapTimeSeriesSample(sample(), context);
    expect(context.devices.devices()).toHaveLength(1);
  });

  it('emits dataAbsentReason rather than a value when the number is not finite', () => {
    const observation = mapTimeSeriesSample(sample({ value: Number.NaN }), context);
    expect(observation?.valueQuantity).toBeUndefined();
    expect(observation?.dataAbsentReason?.coding?.[0]?.code).toBe('unknown');
  });

  it('produces the same id for the same sample on every run, so a re-sync is idempotent', () => {
    const first = mapTimeSeriesSample(sample(), context);
    const second = mapTimeSeriesSample(sample(), context);
    expect(first?.id).toBe(second?.id);
    expect(first?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
