import type { Observation } from 'fhir/r4';
import type { Marker, MarkerList } from '../../api/schemas/marker';
import { applyCommonFields, CATEGORY, compact, createObservation, numericComponent, SYSTEMS } from './shared';

export function mapMarkerToFHIR(marker: Marker): Observation {
  const display = marker.label ?? `Marker ${marker.marker_path}`;

  const observation = createObservation({
    category: CATEGORY.EXAM,
    code: { system: SYSTEMS.VITRONIC, code: marker.marker_path, display },

    components: compact([
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${marker.marker_path}.x`, display: `${display} (X axis)` },
        marker.position[0],
        { unit: 'meters', system: SYSTEMS.UCUM, code: 'm' }
      ),
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${marker.marker_path}.y`, display: `${display} (Y axis)` },
        marker.position[1],
        { unit: 'meters', system: SYSTEMS.UCUM, code: 'm' }
      ),
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${marker.marker_path}.z`, display: `${display} (Z axis)` },
        marker.position[2],
        { unit: 'meters', system: SYSTEMS.UCUM, code: 'm' }
      ),
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${marker.marker_path}.normal.x`, display: `${display} (Normal X axis)` },
        marker.normal[0],
        { unit: 'degree', system: SYSTEMS.UCUM, code: 'deg' }
      ),
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${marker.marker_path}.normal.y`, display: `${display} (Normal Y axis)` },
        marker.normal[1],
        { unit: 'degree', system: SYSTEMS.UCUM, code: 'deg' }
      ),
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${marker.marker_path}.normal.z`, display: `${display} (Normal Z axis)` },
        marker.normal[2],
        { unit: 'degree', system: SYSTEMS.UCUM, code: 'deg' }
      )
    ])
  });

  return applyCommonFields(observation, marker, SYSTEMS.VITRONIC);
}

export function mapMarkerListToFHIR(markers: MarkerList): Observation[] {
  return markers.map(mapMarkerToFHIR);
}
