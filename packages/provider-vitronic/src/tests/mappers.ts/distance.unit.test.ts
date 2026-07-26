import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Distance } from '../../api/schemas/distance';
import { mapDistanceListToFHIR, mapDistanceToFHIR } from '../../fhir/mappers/distance';
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
    const observation = mapDistanceToFHIR(makeDistance({ label: 'Shoulder width' }), CONTEXT);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: {
        coding: [{ system: VITRONIC, code: 'distance/shoulder', display: 'Distance distance/shoulder' }],
        text: 'Shoulder width'
      },
      subject: SUBJECT,
      effectiveDateTime: RECORDED_AT,
      valueQuantity: { value: 0.45, unit: 'meters', system: UCUM, code: 'm' }
    });
  });

  it('keeps the overall distance and all three axis components', () => {
    const observation = mapDistanceToFHIR(makeDistance(), CONTEXT);

    expect(observation.component).toEqual([
      {
        code: { coding: [{ system: VITRONIC, code: 'distance/shoulder.linear', display: 'Linear distance' }] },
        valueQuantity: { value: 0.45, unit: 'meters', system: UCUM, code: 'm' }
      },
      {
        code: {
          coding: [{ system: VITRONIC, code: 'distance/shoulder.x', display: 'Linear distance, x component' }]
        },
        valueQuantity: { value: 0.4, unit: 'meters', system: UCUM, code: 'm' }
      },
      {
        code: {
          coding: [{ system: VITRONIC, code: 'distance/shoulder.y', display: 'Linear distance, y component' }]
        },
        valueQuantity: { value: 0.1, unit: 'meters', system: UCUM, code: 'm' }
      },
      {
        code: {
          coding: [{ system: VITRONIC, code: 'distance/shoulder.z', display: 'Linear distance, z component' }]
        },
        valueQuantity: { value: 0.05, unit: 'meters', system: UCUM, code: 'm' }
      }
    ]);
  });

  it('promotes the component named by preference, by axis or in full', () => {
    expect(mapDistanceToFHIR(makeDistance({ preference: 'x' }), CONTEXT).valueQuantity?.value).toBe(0.4);
    expect(mapDistanceToFHIR(makeDistance({ preference: 'linear_distance_z' }), CONTEXT).valueQuantity?.value).toBe(
      0.05
    );
    expect(mapDistanceToFHIR(makeDistance({ preference: 'unrecognised' }), CONTEXT).valueQuantity?.value).toBe(0.45);
  });

  it('states the distance is absent rather than emitting a Quantity with no value', () => {
    const observation = mapDistanceToFHIR(
      makeDistance({
        distances: { linear_distance: Number.NaN, linear_distance_x: 0, linear_distance_y: 0, linear_distance_z: 0 }
      }),
      CONTEXT
    );

    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.dataAbsentReason?.coding?.[0].code).toBe('error');
  });

  it('describes the code in coding.display and keeps the operator label in code.text', () => {
    const observation = mapDistanceToFHIR(makeDistance(), CONTEXT);

    expect(observation.code.coding?.[0].display).toBe('Distance distance/shoulder');
    expect(observation.code.text).toBeUndefined();
  });

  it('records the scan and the two landmarks the distance runs between', () => {
    const observation = mapDistanceToFHIR(makeDistance(), CONTEXT);

    expect(observation.derivedFrom).toEqual([
      SCAN_REFERENCE,
      markerReferenceFor('marker/from', 'From marker'),
      markerReferenceFor('marker/to', 'To marker')
    ]);
    expect(observation.identifier).toEqual([measurementIdentifierFor('distance', 'distance/shoulder')]);
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapDistanceToFHIR(makeDistance({ note: 'across', key_external: 'ext-3' }), CONTEXT);

    expect(observation.note).toEqual([{ text: 'across' }]);
    expect(observation.identifier?.[1]?.value).toBe('external-key/ext-3');
  });
});

describe('mapDistanceListToFHIR', () => {
  it('maps every distance in the list', () => {
    const observations = mapDistanceListToFHIR(
      [makeDistance({ distance_path: 'distance/a' }), makeDistance({ distance_path: 'distance/b' })],
      CONTEXT
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('distance/a');
    expect(observations[1].code.coding?.[0].code).toBe('distance/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapDistanceListToFHIR([], CONTEXT)).toEqual([]);
  });
});
