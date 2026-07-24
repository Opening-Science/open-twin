import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Property } from '../../api/schemas/properties';
import { mapPropertyListToFHIR, mapPropertyToFHIR } from '../../fhir/mappers/properties';
import { OBSERVATION_CATEGORY, SCAN_ID, VITRONIC } from './testHelpers';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    property_path: 'property/gender',
    value: 'male',
    ...overrides
  };
}

describe('mapPropertyToFHIR', () => {
  it('maps to an exam Observation with the property metadata', () => {
    const observation = mapPropertyToFHIR(makeProperty({ label: 'Gender' }), SCAN_ID);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: { coding: [{ system: VITRONIC, code: 'property/gender', display: 'Gender' }] },
      subject: { reference: `Scan/${SCAN_ID}` }
    });
  });

  it('maps a numeric value to valueQuantity', () => {
    const observation = mapPropertyToFHIR(makeProperty({ value: 42 }), SCAN_ID);

    expect(observation.valueQuantity).toEqual({ value: 42 });
    expect(observation.valueString).toBeUndefined();
    expect(observation.valueBoolean).toBeUndefined();
  });

  it('maps a boolean value to valueBoolean', () => {
    const observation = mapPropertyToFHIR(makeProperty({ value: true }), SCAN_ID);

    expect(observation.valueBoolean).toBe(true);
    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.valueString).toBeUndefined();
  });

  it('maps a string value to valueString', () => {
    const observation = mapPropertyToFHIR(makeProperty({ value: 'male' }), SCAN_ID);

    expect(observation.valueString).toBe('male');
    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.valueBoolean).toBeUndefined();
  });

  it('serialises object values to a JSON valueString', () => {
    const observation = mapPropertyToFHIR(makeProperty({ value: { a: 1, b: 2 } }), SCAN_ID);

    expect(observation.valueString).toBe('{"a":1,"b":2}');
  });

  it('omits all value fields for null or undefined values', () => {
    const nullObservation = mapPropertyToFHIR(makeProperty({ value: null }), SCAN_ID);
    const undefinedObservation = mapPropertyToFHIR(makeProperty({ value: undefined }), SCAN_ID);

    for (const observation of [nullObservation, undefinedObservation]) {
      expect(observation.valueQuantity).toBeUndefined();
      expect(observation.valueBoolean).toBeUndefined();
      expect(observation.valueString).toBeUndefined();
    }
  });

  it('does not treat a non-finite number as a numeric valueQuantity', () => {
    const observation = mapPropertyToFHIR(makeProperty({ value: Number.NaN }), SCAN_ID);

    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.valueBoolean).toBeUndefined();
    // A non-finite number is not a plain string/boolean, so it is JSON-serialised (NaN -> "null").
    expect(observation.valueString).toBe('null');
  });

  it('falls back to a generated display when label is absent', () => {
    const observation = mapPropertyToFHIR(makeProperty(), SCAN_ID);

    expect(observation.code.coding?.[0].display).toBe('Property property/gender');
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapPropertyToFHIR(makeProperty({ note: 'self-reported', key_external: 'ext-4' }), SCAN_ID);

    expect(observation.note).toEqual([{ text: 'self-reported' }]);
    expect(observation.identifier).toEqual([{ system: VITRONIC, value: 'ext-4' }]);
  });
});

describe('mapPropertyListToFHIR', () => {
  it('maps every property in the list', () => {
    const observations = mapPropertyListToFHIR(
      [makeProperty({ property_path: 'property/a' }), makeProperty({ property_path: 'property/b' })],
      SCAN_ID
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('property/a');
    expect(observations[1].code.coding?.[0].code).toBe('property/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapPropertyListToFHIR([], SCAN_ID)).toEqual([]);
  });
});
