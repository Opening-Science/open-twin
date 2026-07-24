import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Angle } from '../../api/schemas/angle';
import { mapAngleListToFHIR, mapAngleToFHIR } from '../../fhir/mappers/angle';
import { makeMarker, OBSERVATION_CATEGORY, SCAN_ID, UCUM, VITRONIC } from './testHelpers';

function makeAngle(overrides: Partial<Angle> = {}): Angle {
  return {
    angle_path: 'angle/elbow',
    at_marker: 'marker/at',
    from_marker: 'marker/from',
    to_marker: 'marker/to',
    angles: { primary: 90, supplementary: 90, conjugate: 270 },
    preference: null,
    details: {
      at_marker: makeMarker({ marker_path: 'marker/at' }),
      from_marker: makeMarker({ marker_path: 'marker/from' }),
      to_marker: makeMarker({ marker_path: 'marker/to' })
    },
    ...overrides
  };
}

describe('mapAngleToFHIR', () => {
  it('maps to an exam Observation with the primary angle as valueQuantity', () => {
    const observation = mapAngleToFHIR(makeAngle({ label: 'Elbow angle' }), SCAN_ID);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: { coding: [{ system: VITRONIC, code: 'angle/elbow', display: 'Elbow angle' }] },
      subject: { reference: `Scan/${SCAN_ID}` },
      valueQuantity: { value: 90, unit: 'degree', system: UCUM, code: 'deg' }
    });
  });

  it('includes supplementary and conjugate angle components', () => {
    const observation = mapAngleToFHIR(makeAngle(), SCAN_ID);

    expect(observation.component).toEqual([
      {
        code: { coding: [{ system: VITRONIC, code: 'angle/elbow#supplementary', display: 'Supplementary angle' }] },
        valueQuantity: { value: 90, unit: 'degree', system: UCUM, code: 'deg' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'angle/elbow#conjugate', display: 'Conjugate angle' }] },
        valueQuantity: { value: 270, unit: 'degree', system: UCUM, code: 'deg' }
      }
    ]);
  });

  it('falls back to a generated display when label is absent', () => {
    const observation = mapAngleToFHIR(makeAngle(), SCAN_ID);

    expect(observation.code.coding?.[0].display).toBe('Angle angle/elbow');
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapAngleToFHIR(makeAngle({ note: 'left arm', key_external: 'ext-1' }), SCAN_ID);

    expect(observation.note).toEqual([{ text: 'left arm' }]);
    expect(observation.identifier).toEqual([{ system: VITRONIC, value: 'ext-1' }]);
  });
});

describe('mapAngleListToFHIR', () => {
  it('maps every angle in the list', () => {
    const observations = mapAngleListToFHIR(
      [makeAngle({ angle_path: 'angle/a' }), makeAngle({ angle_path: 'angle/b' })],
      SCAN_ID
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('angle/a');
    expect(observations[1].code.coding?.[0].code).toBe('angle/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapAngleListToFHIR([], SCAN_ID)).toEqual([]);
  });
});
