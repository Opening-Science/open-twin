import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Axis } from '../../api/schemas/axes';
import { mapAxesListToFHIR, mapAxisToFHIR } from '../../fhir/mappers/axes';
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

/** Radians, like the angle payload — see the note in angle.unit.test.ts. */
function makeAxis(overrides: Partial<Axis> = {}): Axis {
  return {
    axis_path: 'axis/spine',
    markers: ['marker/a', 'marker/b'],
    rotation: { xy: Math.PI / 18, yz: Math.PI / 9, xz: Math.PI / 6 },
    details: { markers: [makeMarker({ marker_path: 'marker/a' }), makeMarker({ marker_path: 'marker/b' })] },
    ...overrides
  };
}

describe('mapAxisToFHIR', () => {
  it('maps to an exam Observation without a top-level valueQuantity', () => {
    const observation = mapAxisToFHIR(makeAxis({ label: 'Spine axis' }), CONTEXT);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: { coding: [{ system: VITRONIC, code: 'axis/spine', display: 'Axis axis/spine' }], text: 'Spine axis' },
      subject: SUBJECT,
      effectiveDateTime: RECORDED_AT
    });
    expect(observation.valueQuantity).toBeUndefined();
  });

  it('converts the radian rotations to degrees in the xy, yz and xz components', () => {
    const observation = mapAxisToFHIR(makeAxis(), CONTEXT);

    expect(observation.component).toEqual([
      {
        code: { coding: [{ system: VITRONIC, code: 'axis/spine.xy', display: 'Rotation in the xy plane' }] },
        valueQuantity: { value: 10, unit: 'degree', system: UCUM, code: 'deg' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'axis/spine.yz', display: 'Rotation in the yz plane' }] },
        valueQuantity: { value: 20, unit: 'degree', system: UCUM, code: 'deg' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'axis/spine.xz', display: 'Rotation in the xz plane' }] },
        valueQuantity: { value: 30, unit: 'degree', system: UCUM, code: 'deg' }
      }
    ]);
  });

  it('converts a real BodyLoop hip rotation to -44.3834 degrees, not -0.7746', () => {
    const observation = mapAxisToFHIR(
      makeAxis({ rotation: { xy: -0.006489517393493571, yz: -0.7746367929397167, xz: 0.006351330732472071 } }),
      CONTEXT
    );

    expect(observation.component?.[1]?.valueQuantity?.value).toBe(-44.3834);
  });

  it('states a rotation is absent rather than emitting a Quantity with no value', () => {
    const observation = mapAxisToFHIR(makeAxis({ rotation: { xy: Number.NaN, yz: 0, xz: 0 } }), CONTEXT);

    expect(observation.component?.[0]?.valueQuantity).toBeUndefined();
    expect(observation.component?.[0]?.dataAbsentReason).toBeDefined();
  });

  it('describes the code in coding.display and keeps the operator label in code.text', () => {
    const observation = mapAxisToFHIR(makeAxis(), CONTEXT);

    expect(observation.code.coding?.[0].display).toBe('Axis axis/spine');
    expect(observation.code.text).toBeUndefined();
  });

  it('records the scan and every landmark the axis was fitted through', () => {
    const observation = mapAxisToFHIR(makeAxis(), CONTEXT);

    expect(observation.derivedFrom).toEqual([
      SCAN_REFERENCE,
      markerReferenceFor('marker/a', 'Axis marker 1'),
      markerReferenceFor('marker/b', 'Axis marker 2')
    ]);
    expect(observation.identifier).toEqual([measurementIdentifierFor('axis', 'axis/spine')]);
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapAxisToFHIR(makeAxis({ note: 'posture', key_external: 'ext-9' }), CONTEXT);

    expect(observation.note).toEqual([{ text: 'posture' }]);
    expect(observation.identifier?.[1]?.value).toBe('external-key/ext-9');
  });
});

describe('mapAxesListToFHIR', () => {
  it('maps every axis in the list', () => {
    const observations = mapAxesListToFHIR(
      [makeAxis({ axis_path: 'axis/a' }), makeAxis({ axis_path: 'axis/b' })],
      CONTEXT
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('axis/a');
    expect(observations[1].code.coding?.[0].code).toBe('axis/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapAxesListToFHIR([], CONTEXT)).toEqual([]);
  });
});
