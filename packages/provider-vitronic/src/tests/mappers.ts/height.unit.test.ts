import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Height } from '../../api/schemas/height';
import { mapHeightListToFHIR, mapHeightToFHIR } from '../../fhir/mappers/height';
import { makeMarker, OBSERVATION_CATEGORY, SCAN_ID, UCUM, VITRONIC } from './testHelpers';

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
    const observation = mapHeightToFHIR(makeHeight({ label: 'Body height' }), SCAN_ID);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: { coding: [{ system: VITRONIC, code: 'height/body', display: 'Body height' }] },
      subject: { reference: `Scan/${SCAN_ID}` },
      valueQuantity: { value: 1.75, unit: 'meter', system: UCUM, code: 'm' }
    });
  });

  it('does not produce any components', () => {
    const observation = mapHeightToFHIR(makeHeight(), SCAN_ID);

    expect(observation.component).toBeUndefined();
  });

  it('falls back to a generated display when label is absent', () => {
    const observation = mapHeightToFHIR(makeHeight(), SCAN_ID);

    expect(observation.code.coding?.[0].display).toBe('Height height/body');
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapHeightToFHIR(makeHeight({ note: 'standing', key_external: 'ext-7' }), SCAN_ID);

    expect(observation.note).toEqual([{ text: 'standing' }]);
    expect(observation.identifier).toEqual([{ system: VITRONIC, value: 'ext-7' }]);
  });
});

describe('mapHeightListToFHIR', () => {
  it('maps every height in the list', () => {
    const observations = mapHeightListToFHIR(
      [makeHeight({ height_path: 'height/a' }), makeHeight({ height_path: 'height/b' })],
      SCAN_ID
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('height/a');
    expect(observations[1].code.coding?.[0].code).toBe('height/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapHeightListToFHIR([], SCAN_ID)).toEqual([]);
  });
});
