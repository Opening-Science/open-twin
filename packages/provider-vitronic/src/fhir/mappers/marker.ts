/**
 * WHAT: Maps one vendor record type into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
GOVERNED BY: DECISIONS.md#d10
 * CORRECTNESS: recorded API response (marker normals are direction cosines); UCUM 1 per DECISIONS.md#d10.
 */
import type { Observation } from 'fhir/r4';
import type { Marker, MarkerList } from '../../api/schemas/marker';
import {
  createMeasurementObservation,
  EXTENSION_BASE,
  type MeasurementContext,
  numericComponent,
  SYSTEMS,
  UCUM
} from './shared';

const AXES = ['x', 'y', 'z'] as const;

export function mapMarkerToFHIR(marker: Marker, context: MeasurementContext): Observation {
  const path = marker.marker_path;
  const normal = marker.normal;

  const components = [
    ...AXES.map((axis, index) =>
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${path}.${axis}`, display: `Position, ${axis} coordinate` },
        marker.position[index],
        UCUM.METRE
      )
    ),
    ...(normal
      ? AXES.map((axis, index) =>
          numericComponent(
            {
              system: SYSTEMS.VITRONIC,
              code: `${path}.normal.${axis}`,
              display: `Surface normal, ${axis} component`
            },
            normal[index],
            UCUM.UNITY
          )
        )
      : [])
  ];

  // `marker_type` distinguishes an auto-detected landmark from a palpated one,
  // which is provenance a consumer needs and FHIR has no element for.
  const markerType = marker.marker_type.trim();

  return createMeasurementObservation({
    context,
    scope: 'marker',
    path,
    common: marker,
    display: `Marker ${path}`,
    components,
    ...(markerType ? { extensions: [{ url: `${EXTENSION_BASE}-marker-type`, valueString: markerType }] } : {})
  });
}

export function mapMarkerListToFHIR(markers: MarkerList, context: MeasurementContext): Observation[] {
  return markers.map((marker) => mapMarkerToFHIR(marker, context));
}
