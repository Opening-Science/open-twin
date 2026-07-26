import { describe, expect, it } from 'vitest';
import type { CommonType } from '../../api/schemas/common';
import {
  bodySiteFromPath,
  commonExtensions,
  createMeasurementObservation,
  degrees,
  humanizePath,
  markerReference,
  measurementContext,
  measurementIdentifier,
  metres,
  radiansToDegrees,
  scanReference,
  toFhirDateTime,
  toFhirInstant
} from '../../fhir/mappers/shared';
import { CONTEXT, RECORDED_AT, SCAN_ID, SUBJECT, UCUM, VITRONIC, VITRONIC_IDENTIFIER } from './testHelpers';

const CODE: CommonType = {};

describe('radiansToDegrees', () => {
  it('converts the BodyLoop radian payload to degrees', () => {
    expect(radiansToDegrees(Math.PI)).toBe(180);
    expect(radiansToDegrees(Math.PI / 2)).toBe(90);
    expect(radiansToDegrees(1.4816501199902758)).toBe(84.8923);
  });

  it('rounds to four decimals so conversion noise does not reach the wire', () => {
    expect(radiansToDegrees(Math.PI / 18)).toBe(10);
  });

  it('passes non-finite input through so the Quantity builder can reject it', () => {
    expect(radiansToDegrees(Number.NaN)).toBeNaN();
  });
});

describe('quantity builders', () => {
  it('builds UCUM-coded quantities', () => {
    expect(degrees(Math.PI)).toEqual({ value: 180, unit: 'degree', system: UCUM, code: 'deg' });
    expect(metres(1.75)).toEqual({ value: 1.75, unit: 'meters', system: UCUM, code: 'm' });
  });

  it('returns undefined for absent or non-finite values, never a value-less Quantity', () => {
    expect(degrees(null)).toBeUndefined();
    expect(degrees(Number.NaN)).toBeUndefined();
    expect(metres(undefined)).toBeUndefined();
    expect(metres(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('keeps a zero value', () => {
    expect(metres(0)).toEqual({ value: 0, unit: 'meters', system: UCUM, code: 'm' });
  });
});

describe('toFhirDateTime', () => {
  it('keeps a timestamp that carries an offset', () => {
    expect(toFhirDateTime('2026-07-25T09:15:00+02:00')).toBe('2026-07-25T09:15:00+02:00');
    expect(toFhirDateTime('2026-07-25T07:15:00.500Z')).toBe('2026-07-25T07:15:00.500Z');
  });

  /** FHIR requires an offset once a time is present, and D7 forbids inventing one. */
  it('narrows an offsetless timestamp to the civil date it actually states', () => {
    expect(toFhirDateTime('2026-07-25T09:15:00')).toBe('2026-07-25');
    expect(toFhirDateTime('2026-07-25')).toBe('2026-07-25');
  });

  it('returns undefined for absent or unparseable input', () => {
    expect(toFhirDateTime(undefined)).toBeUndefined();
    expect(toFhirDateTime(null)).toBeUndefined();
    expect(toFhirDateTime('   ')).toBeUndefined();
    expect(toFhirDateTime('yesterday')).toBeUndefined();
  });
});

describe('toFhirInstant', () => {
  it('accepts only a full instant, because Bundle.timestamp admits no lower precision', () => {
    expect(toFhirInstant('2026-07-25T09:15:00+02:00')).toBe('2026-07-25T09:15:00+02:00');
    expect(toFhirInstant('2026-07-25T09:15:00')).toBeUndefined();
    expect(toFhirInstant('2026-07-25')).toBeUndefined();
  });
});

describe('humanizePath', () => {
  it('reads a measurement path as words and expands the laterality suffix', () => {
    expect(humanizePath('arm.shoulder.R')).toBe('Arm shoulder (right)');
    expect(humanizePath('leg.hip.M')).toBe('Leg hip (midline)');
    expect(humanizePath('torso.cingulum_praefere_posterior.M')).toBe('Torso cingulum praefere posterior (midline)');
  });

  it('drops the model namespace, which names a geometry and not an anatomy', () => {
    expect(humanizePath('stick_model.arm.shoulder.R')).toBe('Arm shoulder (right)');
  });

  it('returns an empty string when nothing is left to say', () => {
    expect(humanizePath('')).toBe('');
    expect(bodySiteFromPath('')).toBeUndefined();
  });

  it('produces a text-only body site rather than guessing a SNOMED CT code', () => {
    expect(bodySiteFromPath('arm.shoulder.R')).toEqual({ text: 'Arm shoulder (right)' });
  });
});

describe('identity', () => {
  it('mints a business identifier scoped to the scan, the scope and the path', () => {
    expect(measurementIdentifier(SCAN_ID, 'angle', 'arm.shoulder.R')).toEqual({
      system: VITRONIC_IDENTIFIER,
      value: `scan/${SCAN_ID}/angle/arm.shoulder.R`
    });
  });

  it('models the scan as a logical ImagingStudy reference, not as the subject', () => {
    expect(scanReference(SCAN_ID)).toEqual({
      type: 'ImagingStudy',
      identifier: { system: VITRONIC_IDENTIFIER, value: `scan/${SCAN_ID}` },
      display: `BodyLoop scan ${SCAN_ID}`
    });
  });

  it('references a landmark Observation by its business identifier', () => {
    expect(markerReference(SCAN_ID, 'marker/knee', 'At marker')).toEqual({
      type: 'Observation',
      identifier: { system: VITRONIC_IDENTIFIER, value: `scan/${SCAN_ID}/marker/marker/knee` },
      display: 'At marker: marker/knee'
    });
  });
});

describe('measurementContext', () => {
  it('derives a deterministic urn:uuid subject when the caller supplies none', () => {
    const context = measurementContext({ scanId: SCAN_ID, subjectKey: 'proband/1' });

    expect(context.subject).toEqual(SUBJECT);
    expect(context.subject).toEqual(measurementContext({ scanId: SCAN_ID, subjectKey: 'proband/1' }).subject);
  });

  it('uses a caller-supplied subject verbatim', () => {
    const context = measurementContext({ scanId: SCAN_ID, subject: { reference: 'Patient/1234' } });

    expect(context.subject).toEqual({ reference: 'Patient/1234' });
  });

  it('falls back to the scan as the subject key, and says so by never claiming a person', () => {
    const context = measurementContext({ scanId: SCAN_ID });

    expect(context.subjectKey).toBe(`viatar/${SCAN_ID}`);
    expect(context.subject.reference).toMatch(/^urn:uuid:/);
  });
});

describe('commonExtensions', () => {
  it('preserves the operator flags FHIR has no element for', () => {
    expect(commonExtensions({ hidden: false, style: 'dashed' })).toEqual([
      { url: 'http://opentwin.ch/fhir/StructureDefinition/vitronic-hidden', valueBoolean: false },
      { url: 'http://opentwin.ch/fhir/StructureDefinition/vitronic-style', valueString: 'dashed' }
    ]);
  });

  it('emits nothing when the flags are absent or null', () => {
    expect(commonExtensions({})).toEqual([]);
    expect(commonExtensions({ hidden: null, style: null })).toEqual([]);
  });
});

describe('createMeasurementObservation', () => {
  it('builds a minimal Observation with an id, an identifier, a subject and a time', () => {
    const observation = createMeasurementObservation({
      context: CONTEXT,
      scope: 'height',
      path: 'height/body',
      common: CODE,
      display: 'Height height/body'
    });

    expect(observation).toEqual({
      resourceType: 'Observation',
      id: observation.id,
      identifier: [{ system: VITRONIC_IDENTIFIER, value: `scan/${SCAN_ID}/height/height/body` }],
      status: 'final',
      code: { coding: [{ system: VITRONIC, code: 'height/body', display: 'Height height/body' }] },
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'exam',
              display: 'Exam'
            }
          ]
        }
      ],
      subject: SUBJECT,
      effectiveDateTime: RECORDED_AT,
      derivedFrom: [scanReference(SCAN_ID)],
      bodySite: { text: 'Height/body' }
    });
    expect(observation.id).toBeTypeOf('string');
  });

  it('omits the body site for measurements that are not about an anatomical location', () => {
    const observation = createMeasurementObservation({
      context: CONTEXT,
      scope: 'properties',
      path: 'property/gender',
      common: CODE,
      display: 'Property property/gender',
      bodySitePath: null
    });

    expect(observation.bodySite).toBeUndefined();
  });

  it('drops components whose value could not be expressed', () => {
    const observation = createMeasurementObservation({
      context: CONTEXT,
      scope: 'marker',
      path: 'marker/knee',
      common: CODE,
      display: 'Marker marker/knee',
      components: [undefined]
    });

    expect(observation.component).toBeUndefined();
  });

  it('never emits both a value and a dataAbsentReason', () => {
    const observation = createMeasurementObservation({
      context: CONTEXT,
      scope: 'height',
      path: 'height/body',
      common: CODE,
      display: 'Height height/body',
      valueQuantity: metres(1.75),
      dataAbsentReason: { coding: [{ code: 'unknown' }] }
    });

    expect(observation.valueQuantity).toBeDefined();
    expect(observation.dataAbsentReason).toBeUndefined();
  });
});
