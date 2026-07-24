import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { CrossSection } from '../../api/schemas/crosssection';
import { mapCrossSectionListToFHIR, mapCrossSectionToFHIR } from '../../fhir/mappers/crosssection';
import { makeMarker, OBSERVATION_CATEGORY, SCAN_ID, UCUM, VITRONIC } from './testHelpers';

function makeCrossSection(overrides: Partial<CrossSection> = {}): CrossSection {
  return {
    crosssection_path: 'crosssection/waist',
    preference: null,
    circumferences: { convex_circumference: 0.8, perimeter_circumference: 0.82 },
    areas: { convex_area: 0.15, perimeter_area: 0.16 },
    contours: {
      convex_contour: { '3D': [[0, 0, 0]], '2D': [[0, 0]] },
      perimeter_contour: { '3D': [[0, 0, 0]], '2D': [[0, 0]] }
    },
    skeletonPosition: { series_path: 'series/1', distanceFromRoot: 500 },
    details: { at_marker: makeMarker({ marker_path: 'marker/waist' }) },
    ...overrides
  };
}

describe('mapCrossSectionToFHIR', () => {
  it('maps to an exam Observation with the convex area as valueQuantity', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection({ label: 'Waist' }), SCAN_ID);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: { coding: [{ system: VITRONIC, code: 'crosssection/waist', display: 'Waist' }] },
      subject: { reference: `Scan/${SCAN_ID}` },
      valueQuantity: { value: 0.15, unit: 'square meter', system: UCUM, code: 'm2' }
    });
  });

  it('maps areas and circumferences into components', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection({ label: 'Waist' }), SCAN_ID);

    expect(observation.component).toEqual([
      {
        code: { coding: [{ system: VITRONIC, code: '0.15', display: 'Waist (Convex Area)' }] },
        valueQuantity: { value: 0.15, unit: 'meter', system: UCUM, code: 'm' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: '0.16', display: 'Waist (Perimeter Area)' }] },
        valueQuantity: { value: 0.16, unit: 'meter', system: UCUM, code: 'm' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: '0.8', display: 'Waist (Convex Circumference)' }] },
        valueQuantity: { value: 0.8, unit: 'meter', system: UCUM, code: 'm' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: '0.82', display: 'Waist (Perimeter Circumference)' }] },
        valueQuantity: { value: 0.82, unit: 'meter', system: UCUM, code: 'm' }
      }
    ]);
  });

  it('omits area components when areas are absent', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection({ label: 'Waist', areas: undefined }), SCAN_ID);

    const componentCodes = observation.component?.map((component) => component.code.coding?.[0].display);
    expect(componentCodes).toEqual(['Waist (Convex Circumference)', 'Waist (Perimeter Circumference)']);
  });

  it('falls back to a generated display when label is absent', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection(), SCAN_ID);

    expect(observation.code.coding?.[0].display).toBe('Cross Section crosssection/waist');
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection({ note: 'abdomen', key_external: 'ext-5' }), SCAN_ID);

    expect(observation.note).toEqual([{ text: 'abdomen' }]);
    expect(observation.identifier).toEqual([{ system: VITRONIC, value: 'ext-5' }]);
  });
});

describe('mapCrossSectionListToFHIR', () => {
  it('maps every cross section in the list', () => {
    const observations = mapCrossSectionListToFHIR(
      [
        makeCrossSection({ crosssection_path: 'crosssection/a' }),
        makeCrossSection({ crosssection_path: 'crosssection/b' })
      ],
      SCAN_ID
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('crosssection/a');
    expect(observations[1].code.coding?.[0].code).toBe('crosssection/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapCrossSectionListToFHIR([], SCAN_ID)).toEqual([]);
  });
});
