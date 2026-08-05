/**
 * WHAT: Maps one vendor record type into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: signed review record (verify/terminology-allowlist.json) for LOINC/SNOMED emitted here; UCUM gate for quantities.
 */
import type { Observation } from 'fhir/r4';
import type { Distance, DistanceList } from '../../api/schemas/distance';
import {
  createMeasurementObservation,
  dataAbsentReason,
  type MeasurementContext,
  metres,
  numericComponent,
  SYSTEMS,
  UCUM
} from './shared';

type DistanceAspect = 'linear_distance' | 'linear_distance_x' | 'linear_distance_y' | 'linear_distance_z';

const ASPECT_CODE: Record<DistanceAspect, string> = {
  linear_distance: 'linear',
  linear_distance_x: 'x',
  linear_distance_y: 'y',
  linear_distance_z: 'z'
};

const ASPECT_DISPLAY: Record<DistanceAspect, string> = {
  linear_distance: 'Linear distance',
  linear_distance_x: 'Linear distance, x component',
  linear_distance_y: 'Linear distance, y component',
  linear_distance_z: 'Linear distance, z component'
};

const ASPECTS: readonly DistanceAspect[] = [
  'linear_distance',
  'linear_distance_x',
  'linear_distance_y',
  'linear_distance_z'
];

/**
 * Resolves `preference`, which may name a component in full
 * (`linear_distance_x`) or by its axis (`x`). Defaults to the overall distance.
 */
function resolveAspect(preference: string | null | undefined): DistanceAspect {
  const value = preference?.trim().toLowerCase().replace(/[\s-]/g, '_');
  if (!value) {
    return 'linear_distance';
  }
  if (value === 'x' || value === 'y' || value === 'z') {
    return `linear_distance_${value}`;
  }
  return ASPECTS.find((aspect) => aspect === value) ?? 'linear_distance';
}

export function mapDistanceToFHIR(distance: Distance, context: MeasurementContext): Observation {
  const path = distance.distance_path;
  const preferred = metres(distance.distances[resolveAspect(distance.preference)]);

  return createMeasurementObservation({
    context,
    scope: 'distance',
    path,
    common: distance,
    display: `Distance ${path}`,
    derivedFromMarkers: [
      { path: distance.from_marker, role: 'From marker' },
      { path: distance.to_marker, role: 'To marker' }
    ],
    ...(preferred ? { valueQuantity: preferred } : { dataAbsentReason: dataAbsentReason('error') }),
    components: ASPECTS.map((aspect) =>
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${path}.${ASPECT_CODE[aspect]}`, display: ASPECT_DISPLAY[aspect] },
        distance.distances[aspect],
        UCUM.METRE
      )
    )
  });
}

export function mapDistanceListToFHIR(distances: DistanceList, context: MeasurementContext): Observation[] {
  return distances.map((distance) => mapDistanceToFHIR(distance, context));
}
