/**
 * BodyLoop axis measurements.
 *
 * An axis is the line fitted through two or more landmarks, and what is measured
 * is its rotation in each of the three scanner planes. There is no single "the"
 * value, so the Observation carries no `value[x]` and groups the three rotations
 * as components — the pattern FHIR prescribes for multi-component results.
 *
 * The rotations are radians, like the angle payload: for `leg.trochanterion` the
 * triple reproduces `atan2` of the direction components of the distance built
 * from the same two markers, to double precision (D10).
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
