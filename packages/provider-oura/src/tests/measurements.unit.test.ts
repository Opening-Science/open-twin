import {
  auditMeasurementDeclarations,
  declarationAddress,
  isSharedMeasurementKey,
  LOINC_CODINGS,
  type MeasurementDeclarationSet,
  SYSTEMS,
  validateMeasurementDeclarations
} from '@open-twin/fhir-core';
import type { Bundle, FhirResource } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { RequestParams } from '../api/schemas/client';
import { buildOuraBundle } from '../fhir/bundleBuilder';
import { LOINC } from '../fhir/mappers/shared';
import { OURA_MEASUREMENTS } from '../fhir/measurements';
import { parseOuraResponse } from '../utils/objectUtils';
import { ouraBundle } from '../verification/exampleBundle';
import { ouraSandboxBundle } from '../verification/sandboxBundle';

/**
 * Fields neither the exemplar nor the sandbox capture populates: the sandbox sends
 * `sleep_regularity` and `pulse_wave_velocity` as null. Shapes follow Oura's
 * published v2 schemas for `daily_readiness` and `daily_cardiovascular_age`.
 */
const SUPPLEMENT_REQUEST: RequestParams = {
  types: ['daily_readiness', 'daily_cardiovascular_age'],
  start_date: '2026-06-20',
  end_date: '2026-06-21'
};

const SUPPLEMENT_PAYLOADS = {
  daily_readiness: {
    data: [
      {
        id: 'readiness-measurements-1',
        day: '2026-06-21',
        timestamp: '2026-06-21T00:00:00+02:00',
        score: 79,
        contributors: {
          activity_balance: 81,
          hrv_balance: 74,
          previous_day_activity: 88,
          previous_night: 70,
          recovery_index: 93,
          resting_heart_rate: 86,
          sleep_balance: 77,
          sleep_regularity: 68
        },
        temperature_deviation: -0.1,
        temperature_trend_deviation: 0.05
      }
    ],
    next_token: null
  },
  daily_cardiovascular_age: {
    data: [{ id: 'cardiovascular-age-measurements-1', day: '2026-06-21', vascular_age: 41, pulse_wave_velocity: 6.9 }],
    next_token: null
  }
} as const;

function supplementBundle(): Bundle {
  const data = SUPPLEMENT_REQUEST.types.map((type) => parseOuraResponse(type, SUPPLEMENT_PAYLOADS[type as never]));
  return buildOuraBundle(data, SUPPLEMENT_REQUEST, {
    timestamp: '2026-07-26T10:00:00Z',
    subjectKey: 'measurements-subject'
  });
}

function resources(bundle: Bundle): FhirResource[] {
  return (bundle.entry ?? []).flatMap((entry) => (entry.resource ? [entry.resource as FhirResource] : []));
}

/** Every Oura mapper, through the real parsers and bundle builder. */
function emitted(): FhirResource[] {
  return [...resources(ouraBundle()), ...resources(ouraSandboxBundle()), ...resources(supplementBundle())];
}

function withoutKey(key: string): MeasurementDeclarationSet {
  return {
    ...OURA_MEASUREMENTS,
    declarations: OURA_MEASUREMENTS.declarations.filter((declaration) => declaration.key !== key)
  };
}

describe('OURA_MEASUREMENTS', () => {
  it('is consistent with the shared definitions', () => {
    expect(validateMeasurementDeclarations(OURA_MEASUREMENTS)).toEqual([]);
  });

  it('declares every Observation and component the mappers emit, each exactly once', () => {
    const audit = auditMeasurementDeclarations(OURA_MEASUREMENTS, emitted());

    expect(audit.issues).toEqual([]);
  });

  it('has every declaration exercised by real mapper output', () => {
    const audit = auditMeasurementDeclarations(OURA_MEASUREMENTS, emitted());

    expect(audit.unexercised.map(declarationAddress)).toEqual([]);
  });

  it('exercises every mapper', () => {
    const codes = new Set(
      emitted().flatMap((resource) =>
        resource.resourceType === 'Observation' ? (resource.code.coding ?? []).map((coding) => coding.code) : []
      )
    );

    for (const code of [
      'sleep-score',
      'activity-score',
      'readiness-score',
      'resilience-level',
      'daily-stress',
      'spo2-daily-summary',
      LOINC_CODINGS.HEART_RATE.code,
      'session',
      'workout',
      LOINC.VO2_MAX.code,
      'vascular-age',
      LOINC.BODY_WEIGHT.code,
      LOINC.BODY_HEIGHT.code,
      'rest-mode',
      'ring-configuration'
    ]) {
      expect(codes, code).toContain(code);
    }
  });

  it('keeps vendor contributor scores off shared keys', () => {
    const hrvBalance = OURA_MEASUREMENTS.declarations.filter(
      (declaration) => declaration.coding.system === SYSTEMS.OURA && declaration.coding.code === 'hrv-balance'
    );

    expect(hrvBalance.map((declaration) => declaration.key)).toEqual(['oura:readiness.contributor.hrv-balance']);
    for (const declaration of OURA_MEASUREMENTS.declarations) {
      if (declaration.unit === '{score}') expect(isSharedMeasurementKey(declaration.key), declaration.key).toBe(false);
    }
  });

  it('reports an emitted component whose declaration is missing', () => {
    const audit = auditMeasurementDeclarations(withoutKey('oura:readiness.contributor.hrv-balance'), emitted());

    expect(audit.issues.length).toBeGreaterThan(0);
    expect(audit.issues.every((issue) => issue.code === 'undeclared' && issue.location === 'component')).toBe(true);
    expect(audit.issues[0]?.codings).toEqual([`${SYSTEMS.OURA}|hrv-balance`]);
  });

  it('reports an emitted Observation whose declaration is missing', () => {
    const audit = auditMeasurementDeclarations(withoutKey('heart-rate'), emitted());

    expect(audit.issues.length).toBeGreaterThan(0);
    expect(audit.issues.every((issue) => issue.code === 'undeclared' && issue.location === 'observation')).toBe(true);
  });

  it('reports a declared unit the mapper does not emit', () => {
    const misdeclared: MeasurementDeclarationSet = {
      ...OURA_MEASUREMENTS,
      declarations: OURA_MEASUREMENTS.declarations.map((declaration) =>
        declaration.key === 'total-sleep-time' ? { ...declaration, unit: 's' } : declaration
      )
    };

    const audit = auditMeasurementDeclarations(misdeclared, emitted());

    expect(audit.issues.length).toBeGreaterThan(0);
    expect(audit.issues.every((issue) => issue.code === 'unit-mismatch')).toBe(true);
  });

  it('reports a sleep mean heart rate declared by its LOINC coding as well as its Oura coding', () => {
    const sleepMean = OURA_MEASUREMENTS.declarations.find((declaration) => declaration.key === 'sleep-mean-heart-rate');
    if (!sleepMean) throw new Error('sleep-mean-heart-rate is not declared');
    const doubled: MeasurementDeclarationSet = {
      ...OURA_MEASUREMENTS,
      declarations: [
        ...OURA_MEASUREMENTS.declarations,
        {
          ...sleepMean,
          key: 'heart-rate',
          context: { scope: 'reading' },
          coding: { system: LOINC_CODINGS.HEART_RATE.system, code: LOINC_CODINGS.HEART_RATE.code }
        }
      ]
    };

    const audit = auditMeasurementDeclarations(doubled, emitted());

    expect(audit.issues.length).toBeGreaterThan(0);
    expect(audit.issues.every((issue) => issue.code === 'ambiguous' && issue.location === 'component')).toBe(true);
  });
});
