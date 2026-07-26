/**
 * BodyLoop angle measurements.
 *
 * Every angle is reported three ways: the `primary` angle at the vertex, its
 * `supplementary` angle (π − primary) and its `conjugate` angle (2π − primary).
 * All three are kept as components; the one named by `preference` is promoted to
 * `value[x]` so that a consumer reading only the value gets the angle the
 * operator selected rather than whichever one the mapper happened to prefer.
 */
import type { Observation } from 'fhir/r4';
import type { Angle, AngleList } from '../../api/schemas/angle';
import {
  createMeasurementObservation,
  dataAbsentReason,
  degrees,
  type MeasurementContext,
  numericComponent,
  radiansToDegrees,
  SYSTEMS,
  UCUM
} from './shared';

type AngleAspect = 'primary' | 'supplementary' | 'conjugate';

const ASPECT_DISPLAY: Record<AngleAspect, string> = {
  primary: 'Primary angle',
  supplementary: 'Supplementary angle',
  conjugate: 'Conjugate angle'
};

const ASPECTS: readonly AngleAspect[] = ['primary', 'supplementary', 'conjugate'];

/** Resolves `preference`, defaulting to the primary angle. */
function resolveAspect(preference: string | null | undefined): AngleAspect {
  const value = preference?.trim().toLowerCase();
  return value === 'supplementary' || value === 'conjugate' ? value : 'primary';
}

export function mapAngleToFHIR(angle: Angle, context: MeasurementContext): Observation {
  const aspect = resolveAspect(angle.preference);
  const preferred = degrees(angle.angles[aspect]);

  return createMeasurementObservation({
    context,
    scope: 'angle',
    path: angle.angle_path,
    common: angle,
    display: `Angle ${angle.angle_path}`,
    // The vertex of the angle is the anatomical site the measurement is about.
    bodySitePath: angle.at_marker,
    derivedFromMarkers: [
      { path: angle.at_marker, role: 'Vertex marker' },
      { path: angle.from_marker, role: 'From marker' },
      { path: angle.to_marker, role: 'To marker' }
    ],
    ...(preferred ? { valueQuantity: preferred } : { dataAbsentReason: dataAbsentReason('error') }),
    components: ASPECTS.map((name) =>
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${angle.angle_path}#${name}`, display: ASPECT_DISPLAY[name] },
        radiansToDegrees(angle.angles[name]),
        UCUM.DEGREE
      )
    )
  });
}

export function mapAngleListToFHIR(angles: AngleList, context: MeasurementContext): Observation[] {
  return angles.map((angle) => mapAngleToFHIR(angle, context));
}
