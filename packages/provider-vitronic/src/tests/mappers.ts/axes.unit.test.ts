import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Axis } from '../../api/schemas/axes';
import { mapAxesListToFHIR, mapAxisToFHIR } from '../../fhir/mappers/axes';
import { makeMarker, OBSERVATION_CATEGORY, SCAN_ID, UCUM, VITRONIC } from './testHelpers';

function makeAxis(overrides: Partial<Axis> = {}): Axis {
  return {
    axis_path: 'axis/spine',
    markers: ['marker/a', 'marker/b'],
    rotation: { xy: 10, yz: 20, xz: 30 },
    details: { markers: [makeMarker({ marker_path: 'marker/a' }), makeMarker({ marker_path: 'marker/b' })] },
    ...overrides
  };
}

describe('mapAxisToFHIR', () => {
  it('maps to an exam Observation without a top-level valueQuantity', () => {
    const observation = mapAxisToFHIR(makeAxis({ label: 'Spine axis' }), SCAN_ID);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: { coding: [{ system: VITRONIC, code: 'axis/spine', display: 'Spine axis' }] },
      subject: { reference: `Scan/${SCAN_ID}` }
    });
    expect(observation.valueQuantity).toBeUndefined();
  });

  it('maps rotation values into xy, yz and xz components', () => {
    const observation = mapAxisToFHIR(makeAxis({ label: 'Spine axis' }), SCAN_ID);

    expect(observation.component).toEqual([
      {
        code: { coding: [{ system: VITRONIC, code: 'axis/spine.xy', display: 'Spine axis (Rotation XY axis)' }] },
        valueQuantity: { value: 10, unit: 'degree', system: UCUM, code: 'deg' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'axis/spine.yz', display: 'Spine axis (Rotation YZ axis)' }] },
        valueQuantity: { value: 20, unit: 'degree', system: UCUM, code: 'deg' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'axis/spine.xz', display: 'Spine axis (Rotation XZ axis)' }] },
        valueQuantity: { value: 30, unit: 'degree', system: UCUM, code: 'deg' }
      }
    ]);
  });

  it('falls back to a generated display when label is absent', () => {
    const observation = mapAxisToFHIR(makeAxis(), SCAN_ID);

    expect(observation.code.coding?.[0].display).toBe('Axis axis/spine');
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapAxisToFHIR(makeAxis({ note: 'posture', key_external: 'ext-9' }), SCAN_ID);

    expect(observation.note).toEqual([{ text: 'posture' }]);
    expect(observation.identifier).toEqual([{ system: VITRONIC, value: 'ext-9' }]);
  });
});

describe('mapAxesListToFHIR', () => {
  it('maps every axis in the list', () => {
    const observations = mapAxesListToFHIR(
      [makeAxis({ axis_path: 'axis/a' }), makeAxis({ axis_path: 'axis/b' })],
      SCAN_ID
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('axis/a');
    expect(observations[1].code.coding?.[0].code).toBe('axis/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapAxesListToFHIR([], SCAN_ID)).toEqual([]);
  });
});
