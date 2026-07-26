import { LOINC_UNITS, SYSTEMS, UCUM } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import { PLATFORM_SERIES_TYPES, SERIES_MAP, UNRESOLVED_SERIES } from '../../fhir/seriesMap';

const measures = Object.entries(SERIES_MAP).flatMap(([type, mapping]) =>
  [mapping.sample, mapping.dailyTotal].filter((measure) => measure !== undefined).map((measure) => ({ type, measure }))
);

describe('SERIES_MAP', () => {
  it('binds every LOINC-coded measure to the one unit the shared table allows (D4)', () => {
    // The whole point of LOINC_UNITS is that two connectors cannot emit the same
    // LOINC code with different units. This fails the moment someone writes a unit
    // literal next to a LOINC code in this package instead of looking it up.
    for (const { type, measure } of measures) {
      const primary = measure.codes[0];
      if (primary?.system !== SYSTEMS.LOINC) continue;
      expect(LOINC_UNITS[primary.code], `${type} -> LOINC ${primary.code}`).toBeDefined();
      expect(measure.unit, `${type} -> LOINC ${primary.code}`).toEqual(LOINC_UNITS[primary.code]);
    }
  });

  it('emits every non-LOINC code under the Foundation-controlled system, never a vendor URL (D3)', () => {
    for (const { type, measure } of measures) {
      for (const coding of measure.codes) {
        if (coding.system === SYSTEMS.LOINC) continue;
        expect(coding.system, type).toBe('http://opentwin.ch/fhir/CodeSystem/open-wearables');
        expect(coding.system, type).not.toContain('#');
      }
    }
  });

  it('gives every measure a UCUM code and a matching human-readable unit', () => {
    for (const { type, measure } of measures) {
      expect(measure.unit.code, type).toBeTruthy();
      expect(measure.unit.unit, type).toBeTruthy();
    }
  });

  it('uses K, not Cel, for temperature deviations', () => {
    // UCUM Cel is a point on an interval scale and cannot express a difference.
    // This repository has already rejected the pair "°C|Cel" for a deviation.
    for (const type of ['skin_temperature_deviation', 'skin_temperature_trend_deviation']) {
      expect(SERIES_MAP[type]?.sample.unit, type).toEqual(UCUM.KELVIN);
    }
    // ...and Cel for an absolute temperature, so the two are not merged by accident.
    expect(SERIES_MAP.skin_temperature?.sample.unit).toEqual(UCUM.CELSIUS);
    expect(SERIES_MAP.body_temperature?.sample.unit).toEqual(UCUM.CELSIUS);
  });

  it('distinguishes a daily step total from an instantaneous one by code and by denominator', () => {
    const steps = SERIES_MAP.steps;
    expect(steps?.sample.codes[0]?.code).toBe('55423-8');
    expect(steps?.dailyTotal?.codes[0]?.code).toBe('41950-7');
    // 41950-7 carries a 24-hour time axis, so its unit must carry the per-day
    // denominator. Emitting both under {steps} makes a daily total and a single
    // reading indistinguishable.
    expect(steps?.sample.unit.code).toBe('{steps}');
    expect(steps?.dailyTotal?.unit.code).toBe('{steps}/d');
  });

  it('accounts for every series type the platform defines, as mapped or as refused', () => {
    // Silence is the failure mode this guards. Without it a series type the
    // platform adds — or one this connector never got round to — is
    // indistinguishable from one that was considered and declined.
    const unaccounted = PLATFORM_SERIES_TYPES.filter((type) => !SERIES_MAP[type] && !UNRESOLVED_SERIES[type]);
    expect(unaccounted).toEqual([]);
  });

  it('maps and refuses only types the platform actually defines', () => {
    const known = new Set(PLATFORM_SERIES_TYPES);
    for (const type of [...Object.keys(SERIES_MAP), ...Object.keys(UNRESOLVED_SERIES)]) {
      expect(known.has(type), type).toBe(true);
    }
  });

  it('declares no series type as both mapped and refused', () => {
    for (const type of Object.keys(SERIES_MAP)) {
      expect(UNRESOLVED_SERIES[type], type).toBeUndefined();
    }
  });

  it('includes the declared unit among the accepted spellings for every mapped type', () => {
    for (const [type, mapping] of Object.entries(SERIES_MAP)) {
      expect(mapping.acceptedUnits, type).toContain(mapping.declaredUnit);
    }
  });
});

describe('UNRESOLVED_SERIES', () => {
  it('refuses the series types whose two primary sources disagree on dimension', () => {
    // Each of these is a specific, checkable disagreement between
    // series_types.py and test_payloads.py. If a future contributor maps one of
    // them, they must first delete it here, which is the point.
    for (const type of [
      'blood_alcohol_content',
      'walking_step_length',
      'running_stride_length',
      'physical_effort',
      'stair_ascent_speed',
      'stair_descent_speed',
      'insulin_delivery',
      'sleeping_breathing_disturbances'
    ]) {
      expect(UNRESOLVED_SERIES[type]?.reason, type).toBe('unit-conflict');
    }
  });

  it('records a reason a reader can check, not just a flag', () => {
    for (const [type, refusal] of Object.entries(UNRESOLVED_SERIES)) {
      expect(refusal.detail.length, type).toBeGreaterThan(20);
    }
  });
});
