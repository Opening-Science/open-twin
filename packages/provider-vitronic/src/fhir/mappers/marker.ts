/**
 * BodyLoop markers — anatomical landmarks.
 *
 * A marker is a point in the scanner's coordinate system, optionally with the
 * surface normal at that point. Being a vector rather than a scalar it has no
 * single `value[x]`; the coordinates are carried as components.
 *
 * The normal is NOT an angle. It sits beside `position` and is a direction
 * vector, so its components are direction cosines in [−1, 1]: dimensionless,
 * UCUM `1`. They were previously published as `deg`, which asserts a plane angle
 * where none exists — a receiver doing UCUM-aware arithmetic reads a normal
 * component of 0.7071 as 0.7071 degrees. Converting them from radians would be
 * worse still, and `rad` would be equally wrong (D10).
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
