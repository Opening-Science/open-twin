import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Property } from '../../api/schemas/properties';
import { mapPropertyListToFHIR, mapPropertyToFHIR } from '../../fhir/mappers/properties';
import { CONTEXT, DATA_ABSENT_REASON, OBSERVATION_CATEGORY, SUBJECT, UCUM, VITRONIC } from './testHelpers';

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
   * Unknown paths have no verified unit (D15). Attaching a UCUM code nobody has
   * verified would assert a dimension the source never claimed.
   */
  it('maps a numeric value on an unknown path to a deliberately unitless valueQuantity', () => {
    const observation = mapPropertyToFHIR(makeProperty({ value: 42 }), CONTEXT);

    expect(observation.valueQuantity).toEqual({ value: 42 });
    expect(observation.valueString).toBeUndefined();
    expect(observation.valueBoolean).toBeUndefined();
    expect(observation.dataAbsentReason).toBeUndefined();
  });

  it('emits SI units for the five exact D15 property paths', () => {
    const cases = [
      { property_path: 'body.height', value: 1.752, unit: 'meter', code: 'm' },
      { property_path: 'body.surface', value: 1.9, unit: 'square meter', code: 'm2' },
      { property_path: 'body.volume', value: 0.07, unit: 'cubic meter', code: 'm3' },
      { property_path: 'body.mass', value: 68.4, unit: 'kilogram', code: 'kg' },
      { property_path: 'body.bmi', value: 22.4, unit: 'kilogram per square meter', code: 'kg/m2' }
    ] as const;

    for (const row of cases) {
      const observation = mapPropertyToFHIR(
        makeProperty({ property_path: row.property_path, value: row.value }),
        CONTEXT
      );
      expect(observation.valueQuantity).toEqual({
        value: row.value,
        unit: row.unit,
        system: UCUM,
        code: row.code
      });
    }
  });

  it('does not treat a prefixed path as a D15 key', () => {
    expect(
      mapPropertyToFHIR(makeProperty({ property_path: 'body.mass_index', value: 22.4 }), CONTEXT).valueQuantity
    ).toEqual({ value: 22.4 });
    expect(
      mapPropertyToFHIR(makeProperty({ property_path: 'body.mass.extra', value: 68.4 }), CONTEXT).valueQuantity
    ).toEqual({ value: 68.4 });
  });

  it('passes body.bmi through as reported, without recomputing mass/height²', () => {
    const mass = 80;
    const height = 2;
    const reportedBmi = 22.4;
    expect(reportedBmi).not.toBe(mass / height ** 2);

    const observation = mapPropertyToFHIR(makeProperty({ property_path: 'body.bmi', value: reportedBmi }), CONTEXT);

    expect(observation.valueQuantity?.value).toBe(reportedBmi);
    expect(observation.valueQuantity?.code).toBe('kg/m2');
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
