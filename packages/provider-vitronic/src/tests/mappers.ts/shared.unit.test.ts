import { describe, expect, it } from 'vitest';
import type { CommonType } from '../../api/schemas/common';
import {
  applyCommonFields,
  CATEGORY,
  codeableConcept,
  compact,
  createObservation,
  numericComponent,
  PATIENT_REFERENCE,
  SYSTEMS,
  stringComponent
} from '../../fhir/mappers/shared';

describe('codeableConcept', () => {
  it('builds a CodeableConcept with a single coding', () => {
    expect(codeableConcept({ system: SYSTEMS.VITRONIC, code: 'abc', display: 'ABC' })).toEqual({
      coding: [{ system: SYSTEMS.VITRONIC, code: 'abc', display: 'ABC' }]
    });
  });

  it('omits the display when not provided', () => {
    expect(codeableConcept({ system: SYSTEMS.VITRONIC, code: 'abc' })).toEqual({
      coding: [{ system: SYSTEMS.VITRONIC, code: 'abc' }]
    });
  });
});

describe('numericComponent', () => {
  it('creates a component with a valueQuantity', () => {
    expect(
      numericComponent({ system: SYSTEMS.VITRONIC, code: 'abc', display: 'ABC' }, 5, {
        unit: 'meters',
        system: SYSTEMS.UCUM,
        code: 'm'
      })
    ).toEqual({
      code: { coding: [{ system: SYSTEMS.VITRONIC, code: 'abc', display: 'ABC' }] },
      valueQuantity: { value: 5, unit: 'meters', system: SYSTEMS.UCUM, code: 'm' }
    });
  });

  it('returns undefined when the value is null or undefined', () => {
    expect(numericComponent({ system: SYSTEMS.VITRONIC, code: 'abc' }, null)).toBeUndefined();
    expect(numericComponent({ system: SYSTEMS.VITRONIC, code: 'abc' }, undefined)).toBeUndefined();
  });

  it('keeps a zero value', () => {
    expect(numericComponent({ system: SYSTEMS.VITRONIC, code: 'abc' }, 0)).toEqual({
      code: { coding: [{ system: SYSTEMS.VITRONIC, code: 'abc' }] },
      valueQuantity: { value: 0 }
    });
  });
});

describe('stringComponent', () => {
  it('creates a component with a valueString', () => {
    expect(stringComponent({ system: SYSTEMS.VITRONIC, code: 'abc' }, 'hello')).toEqual({
      code: { coding: [{ system: SYSTEMS.VITRONIC, code: 'abc' }] },
      valueString: 'hello'
    });
  });

  it('returns undefined when the value is null or undefined', () => {
    expect(stringComponent({ system: SYSTEMS.VITRONIC, code: 'abc' }, null)).toBeUndefined();
    expect(stringComponent({ system: SYSTEMS.VITRONIC, code: 'abc' }, undefined)).toBeUndefined();
  });
});

describe('compact', () => {
  it('removes undefined entries while keeping falsy values', () => {
    expect(compact([1, undefined, 0, undefined, 2])).toEqual([1, 0, 2]);
  });

  it('returns an empty array when everything is undefined', () => {
    expect(compact([undefined, undefined])).toEqual([]);
  });
});

describe('createObservation', () => {
  it('creates a minimal Observation with the default patient reference', () => {
    const observation = createObservation({ code: { system: SYSTEMS.VITRONIC, code: 'abc' } });

    expect(observation).toEqual({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: SYSTEMS.VITRONIC, code: 'abc' }] },
      subject: { reference: PATIENT_REFERENCE }
    });
  });

  it('uses a custom patient reference when provided', () => {
    const observation = createObservation({
      code: { system: SYSTEMS.VITRONIC, code: 'abc' },
      patientReference: 'Scan/xyz'
    });

    expect(observation.subject).toEqual({ reference: 'Scan/xyz' });
  });

  it('adds a category coding when a category is provided', () => {
    const observation = createObservation({ code: { system: SYSTEMS.VITRONIC, code: 'abc' }, category: CATEGORY.EXAM });

    expect(observation.category).toEqual([
      { coding: [{ system: SYSTEMS.OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }
    ]);
  });

  it('sets value fields when provided', () => {
    const observation = createObservation({
      code: { system: SYSTEMS.VITRONIC, code: 'abc' },
      valueQuantity: { value: 12, unit: 'mm', system: SYSTEMS.UCUM, code: 'mm' },
      valueString: 'text',
      valueBoolean: true
    });

    expect(observation.valueQuantity).toEqual({ value: 12, unit: 'mm', system: SYSTEMS.UCUM, code: 'mm' });
    expect(observation.valueString).toBe('text');
    expect(observation.valueBoolean).toBe(true);
  });

  it('omits the component array when no components are provided', () => {
    const observation = createObservation({ code: { system: SYSTEMS.VITRONIC, code: 'abc' }, components: [] });

    expect(observation.component).toBeUndefined();
  });
});

describe('applyCommonFields', () => {
  const base = () => createObservation({ code: { system: SYSTEMS.VITRONIC, code: 'abc' }, patientReference: 'Scan/1' });

  it('adds a note when present', () => {
    const common: CommonType = { note: 'a note' };
    const observation = applyCommonFields(base(), common, SYSTEMS.VITRONIC);

    expect(observation.note).toEqual([{ text: 'a note' }]);
  });

  it('adds an identifier when key_external is present', () => {
    const common: CommonType = { key_external: 'ext-1' };
    const observation = applyCommonFields(base(), common, SYSTEMS.VITRONIC);

    expect(observation.identifier).toEqual([{ system: SYSTEMS.VITRONIC, value: 'ext-1' }]);
  });

  it('leaves note and identifier untouched when common fields are empty', () => {
    const observation = applyCommonFields(base(), {}, SYSTEMS.VITRONIC);

    expect(observation.note).toBeUndefined();
    expect(observation.identifier).toBeUndefined();
  });

  it('returns the same observation instance', () => {
    const observation = base();
    expect(applyCommonFields(observation, {}, SYSTEMS.VITRONIC)).toBe(observation);
  });
});
