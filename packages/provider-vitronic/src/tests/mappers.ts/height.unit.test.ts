import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Height } from '../../api/schemas/height';
import { mapHeightListToFHIR, mapHeightToFHIR } from '../../fhir/mappers/height';
import {
  CONTEXT,
  makeMarker,
  markerReferenceFor,
  measurementIdentifierFor,
  OBSERVATION_CATEGORY,
  RECORDED_AT,
  SCAN_REFERENCE,
  SUBJECT,
  UCUM,
  VITRONIC
} from './testHelpers';

function makeHeight(overrides: Partial<Height> = {}): Height {
  return {
    height_path: 'height/body',
    at_marker: 'marker/head',
    height: 1.75,
    details: { at_marker: makeMarker({ marker_path: 'marker/head' }) },
    ...overrides
  };
}

describe('mapHeightToFHIR', () => {
  it('maps to an exam Observation with the height as valueQuantity', () => {
    const observation = mapHeightToFHIR(makeHeight({ label: 'Body height' }), CONTEXT);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: {
        coding: [{ system: VITRONIC, code: 'height/body', display: 'Height height/body' }],
        text: 'Body height'
      },
      subject: SUBJECT,
      effectiveDateTime: RECORDED_AT,
      valueQuantity: { value: 1.75, unit: 'meters', system: UCUM, code: 'm' }
    });
  });

  it('does not assert a LOINC body-height code for a landmark height', () => {
    const observation = mapHeightToFHIR(makeHeight(), CONTEXT);

    expect(observation.code.coding?.every((coding) => coding.system === VITRONIC)).toBe(true);
  });

  it('does not produce any components', () => {
    expect(mapHeightToFHIR(makeHeight(), CONTEXT).component).toBeUndefined();
  });

  it('states the height is absent rather than emitting a Quantity with no value', () => {
    const observation = mapHeightToFHIR(makeHeight({ height: Number.POSITIVE_INFINITY }), CONTEXT);

    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.dataAbsentReason?.coding?.[0].code).toBe('error');
  });

  it('describes the code in coding.display and keeps the operator label in code.text', () => {
    const observation = mapHeightToFHIR(makeHeight(), CONTEXT);

    expect(observation.code.coding?.[0].display).toBe('Height height/body');
    expect(observation.code.text).toBeUndefined();
  });

  it('records the scan and the landmark the height was measured at', () => {
    const observation = mapHeightToFHIR(makeHeight(), CONTEXT);

    expect(observation.derivedFrom).toEqual([SCAN_REFERENCE, markerReferenceFor('marker/head', 'At marker')]);
    expect(observation.identifier).toEqual([measurementIdentifierFor('height', 'height/body')]);
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapHeightToFHIR(makeHeight({ note: 'standing', key_external: 'ext-7' }), CONTEXT);

    expect(observation.note).toEqual([{ text: 'standing' }]);
    expect(observation.identifier?.[1]?.value).toBe('external-key/ext-7');
  });
});

describe('mapHeightListToFHIR', () => {
  it('maps every height in the list', () => {
    const observations = mapHeightListToFHIR(
      [makeHeight({ height_path: 'height/a' }), makeHeight({ height_path: 'height/b' })],
      CONTEXT
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('height/a');
    expect(observations[1].code.coding?.[0].code).toBe('height/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapHeightListToFHIR([], CONTEXT)).toEqual([]);
  });
});
