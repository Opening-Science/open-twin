import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Distance } from '../../api/schemas/distance';
import { mapDistanceListToFHIR, mapDistanceToFHIR } from '../../fhir/mappers/distance';
import { makeMarker, OBSERVATION_CATEGORY, SCAN_ID, UCUM, VITRONIC } from './testHelpers';

function makeDistance(overrides: Partial<Distance> = {}): Distance {
  return {
    distance_path: 'distance/shoulder',
    from_marker: 'marker/from',
    to_marker: 'marker/to',
    distances: {
      linear_distance: 0.45,
      linear_distance_x: 0.4,
      linear_distance_y: 0.1,
      linear_distance_z: 0.05
    },
    preference: null,
    details: {
      from_marker: makeMarker({ marker_path: 'marker/from' }),
      to_marker: makeMarker({ marker_path: 'marker/to' })
    },
    ...overrides
  };
}

describe('mapDistanceToFHIR', () => {
  it('maps to an exam Observation with the linear distance as valueQuantity', () => {
    const observation = mapDistanceToFHIR(makeDistance({ label: 'Shoulder width' }), SCAN_ID);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: { coding: [{ system: VITRONIC, code: 'distance/shoulder', display: 'Shoulder width' }] },
      subject: { reference: `Scan/${SCAN_ID}` },
      valueQuantity: { value: 0.45, unit: 'meters', code: 'm', system: UCUM }
    });
  });

  it('maps the axis distances into x, y and z components', () => {
    const observation = mapDistanceToFHIR(makeDistance({ label: 'Shoulder width' }), SCAN_ID);

    expect(observation.component).toEqual([
      {
        code: { coding: [{ system: VITRONIC, code: 'distance/shoulder.x', display: 'Shoulder width (X axis)' }] },
        valueQuantity: { value: 0.4, unit: 'meters', code: 'm', system: UCUM }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'distance/shoulder.y', display: 'Shoulder width (Y axis)' }] },
        valueQuantity: { value: 0.1, unit: 'meters', code: 'm', system: UCUM }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'distance/shoulder.z', display: 'Shoulder width (Z axis)' }] },
        valueQuantity: { value: 0.05, unit: 'meters', code: 'm', system: UCUM }
      }
    ]);
  });

  it('falls back to a generated display when label is absent', () => {
    const observation = mapDistanceToFHIR(makeDistance(), SCAN_ID);

    expect(observation.code.coding?.[0].display).toBe('Distance distance/shoulder');
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapDistanceToFHIR(makeDistance({ note: 'across', key_external: 'ext-3' }), SCAN_ID);

    expect(observation.note).toEqual([{ text: 'across' }]);
    expect(observation.identifier).toEqual([{ system: VITRONIC, value: 'ext-3' }]);
  });
});

describe('mapDistanceListToFHIR', () => {
  it('maps every distance in the list', () => {
    const observations = mapDistanceListToFHIR(
      [makeDistance({ distance_path: 'distance/a' }), makeDistance({ distance_path: 'distance/b' })],
      SCAN_ID
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('distance/a');
    expect(observations[1].code.coding?.[0].code).toBe('distance/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapDistanceListToFHIR([], SCAN_ID)).toEqual([]);
  });
});
