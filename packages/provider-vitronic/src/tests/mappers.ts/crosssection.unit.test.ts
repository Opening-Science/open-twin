import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { CrossSection } from '../../api/schemas/crosssection';
import { mapCrossSectionListToFHIR, mapCrossSectionToFHIR } from '../../fhir/mappers/crosssection';
import {
  CONTEXT,
  makeMarker,
  markerReferenceFor,
  measurementIdentifierFor,
  OBSERVATION_CATEGORY,
  SCAN_REFERENCE,
  SUBJECT,
  UCUM,
  VITRONIC
} from './testHelpers';

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
    skeletonPosition: { series_path: 'series/1', distanceFromRoot: 0.5 },
    details: { at_marker: makeMarker({ marker_path: 'marker/waist' }) },
    ...overrides
  };
}

describe('mapCrossSectionToFHIR', () => {
  it('promotes the circumference, not the enclosed area, to valueQuantity', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection({ label: 'Waist' }), CONTEXT);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: {
        coding: [{ system: VITRONIC, code: 'crosssection/waist', display: 'Cross Section crosssection/waist' }],
        text: 'Waist'
      },
      subject: SUBJECT,
      valueQuantity: { value: 0.8, unit: 'meter', system: UCUM, code: 'm' }
    });
  });

  it('promotes the contour named by preference', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection({ preference: 'perimeter' }), CONTEXT);

    expect(observation.valueQuantity?.value).toBe(0.82);
  });

  it('codes each component by what it measures, not by the number it carries', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection(), CONTEXT);

    expect(observation.component).toEqual([
      {
        code: {
          coding: [
            {
              system: VITRONIC,
              code: 'crosssection/waist#convex-circumference',
              display: 'Circumference (Convex hull)'
            }
          ]
        },
        valueQuantity: { value: 0.8, unit: 'meter', system: UCUM, code: 'm' }
      },
      {
        code: {
          coding: [
            {
              system: VITRONIC,
              code: 'crosssection/waist#perimeter-circumference',
              display: 'Circumference (Skin perimeter)'
            }
          ]
        },
        valueQuantity: { value: 0.82, unit: 'meter', system: UCUM, code: 'm' }
      },
      {
        code: {
          coding: [{ system: VITRONIC, code: 'crosssection/waist#convex-area', display: 'Area (Convex hull)' }]
        },
        valueQuantity: { value: 0.15, unit: 'square meter', system: UCUM, code: 'm2' }
      },
      {
        code: {
          coding: [{ system: VITRONIC, code: 'crosssection/waist#perimeter-area', display: 'Area (Skin perimeter)' }]
        },
        valueQuantity: { value: 0.16, unit: 'square meter', system: UCUM, code: 'm2' }
      },
      {
        code: {
          coding: [
            {
              system: VITRONIC,
              code: 'crosssection/waist#distance-from-root',
              display: 'Distance from the root of the skeleton series'
            }
          ]
        },
        valueQuantity: { value: 0.5, unit: 'meter', system: UCUM, code: 'm' }
      }
    ]);
  });

  it('omits the area components when areas are absent and still states a circumference', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection({ label: 'Waist', areas: undefined }), CONTEXT);

    expect(observation.component?.map((component) => component.code.coding?.[0].code)).toEqual([
      'crosssection/waist#convex-circumference',
      'crosssection/waist#perimeter-circumference',
      'crosssection/waist#distance-from-root'
    ]);
    // The area is genuinely absent; the circumference is not, so value[x] stays
    // present and no Quantity with a unit and no value is emitted.
    expect(observation.valueQuantity).toEqual({ value: 0.8, unit: 'meter', system: UCUM, code: 'm' });
    expect(observation.dataAbsentReason).toBeUndefined();
  });

  it('states the circumference is absent when it is not a number', () => {
    const observation = mapCrossSectionToFHIR(
      makeCrossSection({ circumferences: { convex_circumference: Number.NaN, perimeter_circumference: 0.82 } }),
      CONTEXT
    );

    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.dataAbsentReason?.coding?.[0].code).toBe('error');
  });

  it('keeps the skeleton series path and the landmark the cut was taken at', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection(), CONTEXT);

    expect(observation.extension).toEqual([
      { url: 'http://opentwin.ch/fhir/StructureDefinition/vitronic-skeleton-series-path', valueString: 'series/1' }
    ]);
    expect(observation.derivedFrom).toEqual([SCAN_REFERENCE, markerReferenceFor('marker/waist', 'At marker')]);
    expect(observation.identifier).toEqual([measurementIdentifierFor('cross_section', 'crosssection/waist')]);
  });

  it('describes the code in coding.display and keeps the operator label in code.text', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection(), CONTEXT);

    expect(observation.code.coding?.[0].display).toBe('Cross Section crosssection/waist');
    expect(observation.code.text).toBeUndefined();
  });

  it('applies common fields (note and identifier)', () => {
    const observation = mapCrossSectionToFHIR(makeCrossSection({ note: 'abdomen', key_external: 'ext-5' }), CONTEXT);

    expect(observation.note).toEqual([{ text: 'abdomen' }]);
    expect(observation.identifier?.[1]?.value).toBe('external-key/ext-5');
  });
});

describe('mapCrossSectionListToFHIR', () => {
  it('maps every cross section in the list', () => {
    const observations = mapCrossSectionListToFHIR(
      [
        makeCrossSection({ crosssection_path: 'crosssection/a' }),
        makeCrossSection({ crosssection_path: 'crosssection/b' })
      ],
      CONTEXT
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('crosssection/a');
    expect(observations[1].code.coding?.[0].code).toBe('crosssection/b');
  });

  it('returns an empty array for an empty list', () => {
    expect(mapCrossSectionListToFHIR([], CONTEXT)).toEqual([]);
  });
});
