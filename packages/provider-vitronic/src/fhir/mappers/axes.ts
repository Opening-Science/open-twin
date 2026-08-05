/**
 * WHAT: Maps one vendor record type into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
GOVERNED BY: DECISIONS.md#d10
 * CORRECTNESS: recorded API response (BodyLoop radians; π identities per DECISIONS.md#d10); UCUM deg.
 */
import type { Observation } from 'fhir/r4';
import type { AxesList, Axis } from '../../api/schemas/axes';
import {
  createMeasurementObservation,
  type MeasurementContext,
  numericComponent,
  radiansToDegrees,
  SYSTEMS,
  UCUM
} from './shared';

type RotationPlane = 'xy' | 'yz' | 'xz';

const PLANE_DISPLAY: Record<RotationPlane, string> = {
  xy: 'Rotation in the xy plane',
  yz: 'Rotation in the yz plane',
  xz: 'Rotation in the xz plane'
};

const PLANES: readonly RotationPlane[] = ['xy', 'yz', 'xz'];

export function mapAxisToFHIR(axis: Axis, context: MeasurementContext): Observation {
  return createMeasurementObservation({
    context,
    scope: 'axis',
    path: axis.axis_path,
    common: axis,
    display: `Axis ${axis.axis_path}`,
    derivedFromMarkers: axis.markers.map((path, index) => ({ path, role: `Axis marker ${index + 1}` })),
    components: PLANES.map((plane) =>
      numericComponent(
        { system: SYSTEMS.VITRONIC, code: `${axis.axis_path}.${plane}`, display: PLANE_DISPLAY[plane] },
        radiansToDegrees(axis.rotation[plane]),
        UCUM.DEGREE
      )
    )
  });
}

export function mapAxesListToFHIR(axesList: AxesList, context: MeasurementContext): Observation[] {
  return axesList.map((axis) => mapAxisToFHIR(axis, context));
}
