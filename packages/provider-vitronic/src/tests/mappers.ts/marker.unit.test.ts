import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Marker } from '../../api/schemas/marker';
import { mapMarkerListToFHIR, mapMarkerToFHIR } from '../../fhir/mappers/marker';
import {
  CONTEXT,
  measurementIdentifierFor,
  OBSERVATION_CATEGORY,
  RECORDED_AT,
  SCAN_REFERENCE,
  SUBJECT,
  UCUM,
  VITRONIC
} from './testHelpers';

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
    const observation = mapMarkerToFHIR(makeTestMarker({ label: 'Knee' }), CONTEXT);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: { coding: [{ system: VITRONIC, code: 'marker/knee', display: 'Marker marker/knee' }], text: 'Knee' },
      subject: SUBJECT,
      effectiveDateTime: RECORDED_AT
    });
    expect(observation.valueQuantity).toBeUndefined();
  });

  it('maps the position into x, y and z components in metres', () => {
    const observation = mapMarkerToFHIR(makeTestMarker(), CONTEXT);

    expect(observation.component).toEqual([
      {
        code: { coding: [{ system: VITRONIC, code: 'marker/knee.x', display: 'Position, x coordinate' }] },
        valueQuantity: { value: 1, unit: 'meter', system: UCUM, code: 'm' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'marker/knee.y', display: 'Position, y coordinate' }] },
        valueQuantity: { value: 2, unit: 'meter', system: UCUM, code: 'm' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'marker/knee.z', display: 'Position, z coordinate' }] },
        valueQuantity: { value: 3, unit: 'meter', system: UCUM, code: 'm' }
      }
    ]);
  });

  /**
   * The normal is a direction vector, not an angle: its components are direction
   * cosines in [-1, 1]. `deg` asserted a plane angle that does not exist, and
   * `rad` — or a radian-to-degree conversion — would be equally wrong. The
   * fixture is a genuine unit vector for the same reason the angle fixtures are
   * radians (D10).
   */
  it('emits the surface normal as dimensionless components, never as an angle', () => {
    const observation = mapMarkerToFHIR(
      makeTestMarker({ label: 'Knee', normal: [Math.SQRT1_2, 0, -Math.SQRT1_2] }),
      CONTEXT
    );

    expect(observation.component).toHaveLength(6);
    expect(observation.component?.slice(3)).toEqual([
      {
        code: {
          coding: [{ system: VITRONIC, code: 'marker/knee.normal.x', display: 'Surface normal, x component' }]
        },
        valueQuantity: { value: Math.SQRT1_2, unit: '1', system: UCUM, code: '1' }
      },
      {
        code: {
          coding: [{ system: VITRONIC, code: 'marker/knee.normal.y', display: 'Surface normal, y component' }]
        },
        valueQuantity: { value: 0, unit: '1', system: UCUM, code: '1' }
      },
      {
        code: {
          coding: [{ system: VITRONIC, code: 'marker/knee.normal.z', display: 'Surface normal, z component' }]
        },
        valueQuantity: { value: -Math.SQRT1_2, unit: '1', system: UCUM, code: '1' }
      }
    ]);
  });

  it('keeps the marker type, which distinguishes an auto-detected landmark from a palpated one', () => {
    const observation = mapMarkerToFHIR(makeTestMarker({ marker_type: 'AutoMarker' }), CONTEXT);

    expect(observation.extension).toEqual([
      { url: 'http://opentwin.ch/fhir/StructureDefinition/vitronic-marker-type', valueString: 'AutoMarker' }
    ]);
  });

  it('describes the code in coding.display and keeps the operator label in code.text', () => {
    const observation = mapMarkerToFHIR(makeTestMarker(), CONTEXT);

    expect(observation.code.coding?.[0].display).toBe('Marker marker/knee');
    expect(observation.code.text).toBeUndefined();
  });

  it('records the scan as provenance and carries a business identifier', () => {
    const observation = mapMarkerToFHIR(makeTestMarker({ note: 'left knee', key_external: 'ext-2' }), CONTEXT);

    expect(observation.derivedFrom).toEqual([SCAN_REFERENCE]);
    expect(observation.note).toEqual([{ text: 'left knee' }]);
    expect(observation.identifier?.[0]).toEqual(measurementIdentifierFor('marker', 'marker/knee'));
    expect(observation.identifier?.[1]?.value).toBe('external-key/ext-2');
  });
});

describe('mapMarkerListToFHIR', () => {
  it('maps every marker in the list', () => {
    const observations = mapMarkerListToFHIR(
      [makeTestMarker({ marker_path: 'marker/a' }), makeTestMarker({ marker_path: 'marker/b' })],
      CONTEXT
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('marker/a');
    expect(observations[1].code.coding?.[0].code).toBe('marker/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapMarkerListToFHIR([], CONTEXT)).toEqual([]);
  });
});
