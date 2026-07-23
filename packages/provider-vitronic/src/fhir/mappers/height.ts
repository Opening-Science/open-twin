import type { Observation } from 'fhir/r4';
import type { Height, HeightList } from '../../api/schemas/height';
import { applyCommonFields, CATEGORY, createObservation, SYSTEMS } from './shared';

export function mapHeightToFHIR(height: Height, scan_id: string): Observation {
  const display = height.label ?? `Height ${height.height_path}`;

  const observation = createObservation({
    category: CATEGORY.EXAM,
    code: { system: SYSTEMS.VITRONIC, code: height.height_path, display },
    patientReference: `Patient/${scan_id}`,
    valueQuantity: { value: height.height, unit: 'millimeter', system: SYSTEMS.UCUM, code: 'mm' }
  });

  return applyCommonFields(observation, height, SYSTEMS.VITRONIC);
}

export function mapHeightListToFHIR(heights: HeightList, scan_id: string): Observation[] {
  return heights.map((height) => mapHeightToFHIR(height, scan_id));
}
