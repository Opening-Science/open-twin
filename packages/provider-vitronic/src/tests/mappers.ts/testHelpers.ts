import type { Marker } from '../../api/schemas/marker';

export const VITRONIC = 'https://www.vitronic.com/bodyloop/measurements';
export const UCUM = 'http://unitsofmeasure.org';
export const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';
export const SCAN_ID = 'scan-123';

export function makeMarker(overrides: Partial<Marker> = {}): Marker {
  return {
    marker_type: 'anatomical',
    marker_path: 'marker/default',
    position: [0, 0, 0],
    normal: [0, 0, 0],
    ...overrides
  };
}
