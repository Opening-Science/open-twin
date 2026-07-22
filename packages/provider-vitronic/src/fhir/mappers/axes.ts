import type { Observation } from 'fhir/r4';
import type { AxesList, Axis } from '../../api/schemas/axes';
import { applyCommonFields, CATEGORY, compact, createObservation, numericComponent, SYSTEMS } from './shared';

export function mapAxisToFHIR(axis: Axis): Observation {
  const display = axis.label ?? `Axis ${axis.axis_path}`;

  const observation = createObservation({
    category: CATEGORY.EXAM,
    code: { system: SYSTEMS.VITRONIC, code: axis.axis_path, display },
    components: compact([
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${axis.axis_path}.xy`, display: `${display} (Rotation XY axis)` },
        axis.rotation.xy,
        { unit: 'degree', system: SYSTEMS.UCUM, code: 'deg' }
      ),
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${axis.axis_path}.yz`, display: `${display} (Rotation YZ axis)` },
        axis.rotation.yz,
        { unit: 'degree', system: SYSTEMS.UCUM, code: 'deg' }
      ),
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${axis.axis_path}.xz`, display: `${display} (Rotation XZ axis)` },
        axis.rotation.xz,
        { unit: 'degree', system: SYSTEMS.UCUM, code: 'deg' }
      )
    ])
  });

  return applyCommonFields(observation, axis, SYSTEMS.VITRONIC);
}

export function mapAxesListToFHIR(axesList: AxesList): Observation[] {
  return axesList.map(mapAxisToFHIR);
}
