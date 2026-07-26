import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Property } from '../../api/schemas/properties';
import { mapPropertyListToFHIR, mapPropertyToFHIR } from '../../fhir/mappers/properties';
import { CONTEXT, DATA_ABSENT_REASON, OBSERVATION_CATEGORY, SUBJECT, VITRONIC } from './testHelpers';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    property_path: 'property/gender',
    value: 'male',
    ...overrides
  };
}

function absentReason(observation: Observation): string | undefined {
  return observation.dataAbsentReason?.coding?.[0].code;
}

describe('mapPropertyToFHIR', () => {
  it('maps to an exam Observation with the property metadata', () => {
    const observation = mapPropertyToFHIR(makeProperty({ label: 'Gender' }), CONTEXT);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: {
        coding: [{ system: VITRONIC, code: 'property/gender', display: 'Property property/gender' }],
        text: 'Gender'
      },
      subject: SUBJECT
    });
  });

  it('does not derive a body site from a property path', () => {
    expect(mapPropertyToFHIR(makeProperty(), CONTEXT).bodySite).toBeUndefined();
  });

  /**
   * The API states no unit for properties anywhere in the payload, so the
   * Quantity carries a value and nothing else. Attaching a UCUM code nobody has
   * verified would assert a dimension the source never claimed.
   */
  it('maps a numeric value to a deliberately unitless valueQuantity', () => {
    const observation = mapPropertyToFHIR(makeProperty({ value: 42 }), CONTEXT);

    expect(observation.valueQuantity).toEqual({ value: 42 });
    expect(observation.valueString).toBeUndefined();
    expect(observation.valueBoolean).toBeUndefined();
    expect(observation.dataAbsentReason).toBeUndefined();
  });

  it('maps a boolean value to valueBoolean', () => {
    const observation = mapPropertyToFHIR(makeProperty({ value: true }), CONTEXT);

    expect(observation.valueBoolean).toBe(true);
    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.valueString).toBeUndefined();
  });

  it('maps a string value to valueString', () => {
    const observation = mapPropertyToFHIR(makeProperty({ value: '  male  ' }), CONTEXT);

    expect(observation.valueString).toBe('male');
    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.valueBoolean).toBeUndefined();
  });

  it('serialises object values to a JSON valueString', () => {
    expect(mapPropertyToFHIR(makeProperty({ value: { a: 1, b: 2 } }), CONTEXT).valueString).toBe('{"a":1,"b":2}');
  });

  it('records a null or undefined value as unknown rather than saying nothing at all', () => {
    const nullObservation = mapPropertyToFHIR(makeProperty({ value: null }), CONTEXT);
    const undefinedObservation = mapPropertyToFHIR(makeProperty({ value: undefined }), CONTEXT);

    for (const observation of [nullObservation, undefinedObservation]) {
      expect(observation.valueQuantity).toBeUndefined();
      expect(observation.valueBoolean).toBeUndefined();
      expect(observation.valueString).toBeUndefined();
      expect(observation.dataAbsentReason).toEqual({
        coding: [{ system: DATA_ABSENT_REASON, code: 'unknown', display: 'Unknown' }]
      });
    }
  });

  it('records an empty string as unknown, because FHIR strings may not be empty', () => {
    expect(absentReason(mapPropertyToFHIR(makeProperty({ value: '   ' }), CONTEXT))).toBe('unknown');
  });

  /** `JSON.stringify(NaN)` is the string "null", which reads as a value. */
  it('records a non-finite number as absent, never as the literal string "null"', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const observation = mapPropertyToFHIR(makeProperty({ value }), CONTEXT);

      expect(observation.valueQuantity).toBeUndefined();
      expect(observation.valueString).toBeUndefined();
      expect(absentReason(observation)).toBe('error');
    }
  });

  it('records a non-serialisable value as an error instead of throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(absentReason(mapPropertyToFHIR(makeProperty({ value: circular }), CONTEXT))).toBe('error');
  });

  it('describes the code in coding.display and keeps the operator label in code.text', () => {
    const observation = mapPropertyToFHIR(makeProperty(), CONTEXT);

    expect(observation.code.coding?.[0].display).toBe('Property property/gender');
    expect(observation.code.text).toBeUndefined();
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapPropertyToFHIR(makeProperty({ note: 'self-reported', key_external: 'ext-4' }), CONTEXT);

    expect(observation.note).toEqual([{ text: 'self-reported' }]);
    expect(observation.identifier?.[1]?.value).toBe('external-key/ext-4');
  });
});

describe('mapPropertyListToFHIR', () => {
  it('maps every property in the list', () => {
    const observations = mapPropertyListToFHIR(
      [makeProperty({ property_path: 'property/a' }), makeProperty({ property_path: 'property/b' })],
      CONTEXT
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('property/a');
    expect(observations[1].code.coding?.[0].code).toBe('property/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapPropertyListToFHIR([], CONTEXT)).toEqual([]);
  });
});
