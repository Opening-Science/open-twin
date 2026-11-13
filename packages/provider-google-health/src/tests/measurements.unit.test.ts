import {
  auditMeasurementDeclarations,
  declarationAddress,
  declareMeasurement,
  type MeasurementDeclarationSet,
  validateMeasurementDeclarations
} from '@open-twin/fhir-core';
import type { Bundle, Observation } from 'fhir/r4';
import type { health_v4 } from 'googleapis';
import { describe, expect, it } from 'vitest';
import { GOOGLE_HEALTH_MEASUREMENTS } from '..';
import { buildBundleFromResponses } from '../fhir/bundleBuilder';
import { googleHealthBundle } from '../verification/exampleBundle';
import { GOOGLE_HEALTH, LOINC, SUBJECT_KEY } from './support/context';
import { measurementResponses } from './support/measurementPayloads';

const OPTIONS = { subjectKey: SUBJECT_KEY, timestamp: '2026-07-26T10:00:00Z', bundleKey: 'google-health-measurements' };

function build(responses: health_v4.Schema$ListDataPointsResponse[] = measurementResponses()) {
  return buildBundleFromResponses(responses, OPTIONS);
}

function observations(bundle: Bundle): Observation[] {
  return (bundle.entry ?? []).flatMap((entry) =>
    entry.resource?.resourceType === 'Observation' ? [entry.resource as Observation] : []
  );
}

function without(key: string): MeasurementDeclarationSet {
  return {
    ...GOOGLE_HEALTH_MEASUREMENTS,
    declarations: GOOGLE_HEALTH_MEASUREMENTS.declarations.filter((declaration) => declaration.key !== key)
  };
}

function declared(code: string, parentCode?: string) {
  return GOOGLE_HEALTH_MEASUREMENTS.declarations.filter(
    (declaration) =>
      declaration.coding.code === code &&
      (parentCode === undefined ||
        (declaration.location.kind === 'component' && declaration.location.parent.code === parentCode))
  );
}

describe('GOOGLE_HEALTH_MEASUREMENTS', () => {
  it('is internally consistent with the shared definitions', () => {
    expect(validateMeasurementDeclarations(GOOGLE_HEALTH_MEASUREMENTS)).toEqual([]);
  });

  it('is a complete, versioned set for the google-health connector', () => {
    expect(GOOGLE_HEALTH_MEASUREMENTS.connector).toBe('google-health');
    expect(GOOGLE_HEALTH_MEASUREMENTS.coverage).toBe('complete');
    expect(GOOGLE_HEALTH_MEASUREMENTS.version).toBe(1);
  });

  it('matches every value the real mappers emit, and every declaration is exercised', () => {
    const { bundle, unmapped } = build();
    const audit = auditMeasurementDeclarations(GOOGLE_HEALTH_MEASUREMENTS, bundle);

    expect(unmapped).toEqual([]);
    expect(audit.issues).toEqual([]);
    // No declaration is exempt: each one is proven against mapper output above.
    expect(audit.unexercised).toEqual([]);
  });

  it('also covers the bundle the HL7 validator checks in CI', () => {
    expect(auditMeasurementDeclarations(GOOGLE_HEALTH_MEASUREMENTS, googleHealthBundle()).issues).toEqual([]);
  });

  it('declares shared LOINC codes through the google-health coding wherever two measures share one', () => {
    // A declaration keyed on these LOINC codes would match two distinct measures.
    for (const code of ['9279-1', '94122-9', '41981-2', '59408-5']) {
      expect(
        GOOGLE_HEALTH_MEASUREMENTS.declarations.filter(
          (declaration) => declaration.location.kind === 'observation' && declaration.coding.code === code
        )
      ).toEqual([]);
    }
    expect(declared('daily-respiratory-rate').map((d) => d.key)).toEqual(['google-health:daily-respiratory-rate']);
    expect(declared('respiratory-rate-sleep-summary').map((d) => d.key)).toEqual(['sleep-mean-respiratory-rate']);
    expect(declared('active-energy-burned').map((d) => d.key)).toEqual(['google-health:active-energy-burned']);
    expect(declared('basal-energy-burned').map((d) => d.key)).toEqual(['google-health:basal-energy-burned']);
    expect(declared('oxygen-saturation').map((d) => d.key)).toEqual(['oxygen-saturation']);
    expect(declared('daily-oxygen-saturation').map((d) => d.key)).toEqual(['google-health:daily-oxygen-saturation']);
  });

  it('declares every documented sleep stage, heart rate zone and activity level behind a dynamic code', () => {
    // Enum lists from the Google Health API v4 discovery document (StageSummary.type,
    // HeartRateZone.heartRateZoneType, ActiveMinutesByActivityLevel.activityLevel), plus
    // the mapper's own `unknown` fallback for an omitted zone or level.
    const stages = ['sleep_stage_type_unspecified', 'awake', 'light', 'deep', 'rem', 'asleep', 'restless'];
    for (const stage of stages) expect(declared(`stage-minutes-${stage}`, 'sleep')).toHaveLength(1);

    const zones = ['heart_rate_zone_type_unspecified', 'light', 'moderate', 'vigorous', 'peak', 'unknown'];
    for (const zone of zones) {
      expect(declared(`heart-rate-zone-${zone}-min`, 'daily-heart-rate-zones')).toHaveLength(1);
      expect(declared(`heart-rate-zone-${zone}-max`, 'daily-heart-rate-zones')).toHaveLength(1);
    }

    const levels = ['activity_level_unspecified', 'light', 'moderate', 'vigorous', 'unknown'];
    for (const level of levels) expect(declared(`active-minutes-${level}`, 'active-minutes')).toHaveLength(1);

    expect(declared('stage-minutes-rem', 'sleep')[0]?.key).toBe('rem-sleep-duration');
    expect(declared('stage-minutes-light', 'sleep')[0]?.key).toBe('light-sleep-duration');
    expect(declared('stage-minutes-deep', 'sleep')[0]?.key).toBe('deep-sleep-duration');
  });

  it('declares the child Observations a sleep session links by hasMember', () => {
    const emitted = observations(build().bundle);
    const codes = new Set(emitted.flatMap((observation) => observation.code.coding?.map((c) => c.code) ?? []));

    expect(codes).toContain('sleep-stage');
    expect(codes).toContain('out-of-bed-segment');
    expect(declared('sleep-stage').map((d) => d.key)).toEqual(['google-health:sleep-stage']);
    expect(declared('out-of-bed-segment').map((d) => d.key)).toEqual(['google-health:out-of-bed-segment']);
  });

  describe('catches what it is for', () => {
    it('reports an emitted Observation whose declaration is missing as undeclared', () => {
      const audit = auditMeasurementDeclarations(without('google-health:basal-energy-burned'), build().bundle);

      expect(audit.issues).toEqual([
        expect.objectContaining({
          code: 'undeclared',
          location: 'observation',
          codings: [`${LOINC}|41981-2`, `${GOOGLE_HEALTH}|basal-energy-burned`]
        })
      ]);
    });

    it('reports a sleep stage Google adds later as an undeclared component', () => {
      const responses = measurementResponses();
      responses.push({
        dataPoints: [
          {
            sleep: {
              interval: { startTime: '2026-07-08T22:00:00Z', endTime: '2026-07-09T06:00:00Z' },
              summary: { stagesSummary: [{ type: 'NEW_STAGE', minutes: '30' }] }
            }
          }
        ]
      });

      const audit = auditMeasurementDeclarations(GOOGLE_HEALTH_MEASUREMENTS, build(responses).bundle);

      expect(audit.issues).toEqual([
        expect.objectContaining({
          code: 'undeclared',
          location: 'component',
          codings: [`${GOOGLE_HEALTH}|stage-minutes-new_stage`]
        })
      ]);
    });

    it('reports a declaration keyed on a LOINC code two measures share as ambiguous', () => {
      const set: MeasurementDeclarationSet = {
        ...GOOGLE_HEALTH_MEASUREMENTS,
        declarations: [
          ...GOOGLE_HEALTH_MEASUREMENTS.declarations,
          declareMeasurement('vo2max', { system: LOINC, code: '94122-9' })
        ]
      };
      const audit = auditMeasurementDeclarations(set, build().bundle);

      expect(audit.issues.map((issue) => issue.code)).toEqual(['ambiguous', 'ambiguous']);
    });

    it('reports a declared unit that differs from the emitted one', () => {
      const set: MeasurementDeclarationSet = {
        ...GOOGLE_HEALTH_MEASUREMENTS,
        declarations: GOOGLE_HEALTH_MEASUREMENTS.declarations.map((declaration) =>
          declaration.key === 'body-height' ? { ...declaration, unit: 'mm' } : declaration
        )
      };
      const audit = auditMeasurementDeclarations(set, build().bundle);

      expect(audit.issues).toEqual([expect.objectContaining({ code: 'unit-mismatch', codings: [`${LOINC}|8302-2`] })]);
    });

    it('reports a declaration no mapper output exercises', () => {
      const extra = declareMeasurement('heart-rate', { system: GOOGLE_HEALTH, code: 'not-emitted' });
      const audit = auditMeasurementDeclarations(
        { ...GOOGLE_HEALTH_MEASUREMENTS, declarations: [...GOOGLE_HEALTH_MEASUREMENTS.declarations, extra] },
        build().bundle
      );

      expect(audit.unexercised.map(declarationAddress)).toEqual([declarationAddress(extra)]);
    });
  });
});
