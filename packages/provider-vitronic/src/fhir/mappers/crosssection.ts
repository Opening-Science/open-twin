/**
 * WHAT: Maps one vendor record type into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: signed review record (verify/terminology-allowlist.json) for LOINC/SNOMED emitted here; UCUM gate for quantities.
 */
import type { Observation } from 'fhir/r4';
import type { CrossSection, CrossSectionList } from '../../api/schemas/crosssection';
import {
  createMeasurementObservation,
  dataAbsentReason,
  EXTENSION_BASE,
  type MeasurementContext,
  metres,
  numericComponent,
  optionalNumericComponent,
  SYSTEMS,
  UCUM
} from './shared';

type Contour = 'convex' | 'perimeter';

const CONTOUR_DISPLAY: Record<Contour, string> = {
  convex: 'Convex hull',
  perimeter: 'Skin perimeter'
};

const CONTOURS: readonly Contour[] = ['convex', 'perimeter'];

/**
 * Resolves `preference`. Defaults to the convex contour, which is the
 * tape-measure equivalent and what BodyLoop itself sends for a waist.
 */
function resolveContour(preference: string | null | undefined): Contour {
  return preference?.trim().toLowerCase() === 'perimeter' ? 'perimeter' : 'convex';
}

export function mapCrossSectionToFHIR(crossSection: CrossSection, context: MeasurementContext): Observation {
  const path = crossSection.crosssection_path;
  const circumferences = crossSection.circumferences;
  const areas = crossSection.areas;
  const contour = resolveContour(crossSection.preference);
  const preferred = metres(
    contour === 'perimeter' ? circumferences.perimeter_circumference : circumferences.convex_circumference
  );

  const components = [
    ...CONTOURS.map((name) =>
      numericComponent(
        {
          system: SYSTEMS.VITRONIC,
          code: `${path}#${name}-circumference`,
          display: `Circumference (${CONTOUR_DISPLAY[name]})`
        },
        name === 'perimeter' ? circumferences.perimeter_circumference : circumferences.convex_circumference,
        UCUM.METRE
      )
    ),
    // `areas` is the one genuinely optional measurement block in the API. When
    // the whole block is absent nothing was measured, so the components are
    // omitted rather than asserted absent.
    ...CONTOURS.map((name) =>
      optionalNumericComponent(
        { system: SYSTEMS.VITRONIC, code: `${path}#${name}-area`, display: `Area (${CONTOUR_DISPLAY[name]})` },
        areas ? (name === 'perimeter' ? areas.perimeter_area : areas.convex_area) : undefined,
        UCUM.SQUARE_METRE
      )
    ),
    // TODO(clinical-review): the API states no unit for `distanceFromRoot`.
    // Metres follow every other length in the BodyLoop payload; confirm against
    // a live instance before a consumer relies on it.
    numericComponent(
      {
        system: SYSTEMS.VITRONIC,
        code: `${path}#distance-from-root`,
        display: 'Distance from the root of the skeleton series'
      },
      crossSection.skeletonPosition.distanceFromRoot,
      UCUM.METRE
    )
  ];

  const seriesPath = crossSection.skeletonPosition.series_path.trim();

  return createMeasurementObservation({
    context,
    scope: 'cross_section',
    path,
    common: crossSection,
    display: `Cross Section ${path}`,
    derivedFromMarkers: [{ path: crossSection.details.at_marker.marker_path, role: 'At marker' }],
    ...(preferred ? { valueQuantity: preferred } : { dataAbsentReason: dataAbsentReason('error') }),
    components,
    ...(seriesPath ? { extensions: [{ url: `${EXTENSION_BASE}-skeleton-series-path`, valueString: seriesPath }] } : {})
  });
}

export function mapCrossSectionListToFHIR(crossSections: CrossSectionList, context: MeasurementContext): Observation[] {
  return crossSections.map((crossSection) => mapCrossSectionToFHIR(crossSection, context));
}
