import type { Observation } from 'fhir/r4';
import type { Angle, AngleList } from '../../api/schemas/angle';
import { applyCommonFields, CATEGORY, compact, createObservation, numericComponent, SYSTEMS } from './shared';

export function mapAngleToFHIR(angle: Angle, scan_id: string): Observation {
  const display = angle.label ?? `Angle ${angle.angle_path}`;

  const observation = createObservation({
    category: CATEGORY.EXAM,
    code: { system: SYSTEMS.VITRONIC, code: angle.angle_path, display },
    patientReference: `Patient/${scan_id}`,
    valueQuantity: { value: angle.angles.primary, unit: 'degree', system: SYSTEMS.UCUM, code: 'deg' },
    components: compact([
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${angle.angle_path}#supplementary`, display: 'Supplementary angle' },
        angle.angles.supplementary,
        { unit: 'degree', system: SYSTEMS.UCUM, code: 'deg' }
      ),
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${angle.angle_path}#conjugate`, display: 'Conjugate angle' },
        angle.angles.conjugate,
        { unit: 'degree', system: SYSTEMS.UCUM, code: 'deg' }
      )
    ])
  });

  return applyCommonFields(observation, angle, SYSTEMS.VITRONIC);
}

export function mapAngleListToFHIR(angles: AngleList, scan_id: string): Observation[] {
  return angles.map((angle) => mapAngleToFHIR(angle, scan_id));
}
