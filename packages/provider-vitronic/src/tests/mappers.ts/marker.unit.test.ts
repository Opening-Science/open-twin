import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Marker } from '../../api/schemas/marker';
import { mapMarkerListToFHIR, mapMarkerToFHIR } from '../../fhir/mappers/marker';
import { OBSERVATION_CATEGORY, SCAN_ID, UCUM, VITRONIC } from './testHelpers';

function makeTestMarker(overrides: Partial<Marker> = {}): Marker {
  return {
    marker_type: 'anatomical',
    marker_path: 'marker/knee',
    position: [1, 2, 3],
    normal: null,
    ...overrides
  };
}

describe('mapMarkerToFHIR', () => {
  it('maps to an exam Observation without a top-level valueQuantity', () => {
    const observation = mapMarkerToFHIR(makeTestMarker({ label: 'Knee' }), SCAN_ID);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: { coding: [{ system: VITRONIC, code: 'marker/knee', display: 'Knee' }] },
      subject: { reference: `Scan/${SCAN_ID}` }
    });
    expect(observation.valueQuantity).toBeUndefined();
  });

  it('maps the position into x, y and z components', () => {
    const observation = mapMarkerToFHIR(makeTestMarker({ label: 'Knee' }), SCAN_ID);

    expect(observation.component).toEqual([
      {
        code: { coding: [{ system: VITRONIC, code: 'marker/knee.x', display: 'Knee (X axis)' }] },
        valueQuantity: { value: 1, unit: 'meters', system: UCUM, code: 'm' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'marker/knee.y', display: 'Knee (Y axis)' }] },
        valueQuantity: { value: 2, unit: 'meters', system: UCUM, code: 'm' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'marker/knee.z', display: 'Knee (Z axis)' }] },
        valueQuantity: { value: 3, unit: 'meters', system: UCUM, code: 'm' }
      }
    ]);
  });

  it('adds normal components when a normal vector is present', () => {
    const observation = mapMarkerToFHIR(makeTestMarker({ label: 'Knee', normal: [10, 20, 30] }), SCAN_ID);

    expect(observation.component).toHaveLength(6);
    expect(observation.component?.slice(3)).toEqual([
      {
        code: { coding: [{ system: VITRONIC, code: 'marker/knee.normal.x', display: 'Knee (Normal X axis)' }] },
        valueQuantity: { value: 10, unit: 'degree', system: UCUM, code: 'deg' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'marker/knee.normal.y', display: 'Knee (Normal Y axis)' }] },
        valueQuantity: { value: 20, unit: 'degree', system: UCUM, code: 'deg' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'marker/knee.normal.z', display: 'Knee (Normal Z axis)' }] },
        valueQuantity: { value: 30, unit: 'degree', system: UCUM, code: 'deg' }
      }
    ]);
  });

  it('falls back to a generated display when label is absent', () => {
    const observation = mapMarkerToFHIR(makeTestMarker(), SCAN_ID);

    expect(observation.code.coding?.[0].display).toBe('Marker marker/knee');
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapMarkerToFHIR(makeTestMarker({ note: 'left knee', key_external: 'ext-2' }), SCAN_ID);

    expect(observation.note).toEqual([{ text: 'left knee' }]);
    expect(observation.identifier).toEqual([{ system: VITRONIC, value: 'ext-2' }]);
  });
});

describe('mapMarkerListToFHIR', () => {
  it('maps every marker in the list', () => {
    const observations = mapMarkerListToFHIR(
      [makeTestMarker({ marker_path: 'marker/a' }), makeTestMarker({ marker_path: 'marker/b' })],
      SCAN_ID
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('marker/a');
    expect(observations[1].code.coding?.[0].code).toBe('marker/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapMarkerListToFHIR([], SCAN_ID)).toEqual([]);
  });
});
