import type { Observation } from 'fhir/r4';
import type { Distance, DistanceList } from '../../api/schemas/distance';
import { applyCommonFields, CATEGORY, compact, createObservation, numericComponent, SYSTEMS } from './shared';

export function mapDistanceToFHIR(distance: Distance): Observation {
  const display = distance.label ?? `Distance ${distance.distance_path}`;

  const observation = createObservation({
    category: CATEGORY.EXAM,
    code: { system: SYSTEMS.VITRONIC, code: distance.distance_path, display },
    valueQuantity: { value: distance.distances.linear_distance, unit: 'meters', code: 'm', system: SYSTEMS.UCUM },
    components: compact([
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${distance.distance_path}.x`, display: `${display} (X axis)` },
        distance.distances.linear_distance_x,
        { unit: 'meters', code: 'm', system: SYSTEMS.UCUM }
      ),
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${distance.distance_path}.y`, display: `${display} (Y axis)` },
        distance.distances.linear_distance_y,
        { unit: 'meters', code: 'm', system: SYSTEMS.UCUM }
      ),
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${distance.distance_path}.z`, display: `${display} (Z axis)` },
        distance.distances.linear_distance_z,
        { unit: 'meters', code: 'm', system: SYSTEMS.UCUM }
      )
    ])
  });

  return applyCommonFields(observation, distance, SYSTEMS.VITRONIC);
}

export function mapDistanceListToFHIR(distances: DistanceList): Observation[] {
  return distances.map(mapDistanceToFHIR);
}
