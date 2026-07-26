/**
 * BodyLoop height measurements.
 *
 * A BodyLoop height is the height of one anatomical landmark above the standing
 * surface, not necessarily the subject's stature, so no LOINC body-height code
 * is asserted: 8302-2 would claim a vital sign the API never promised, and its
 * R4 profile fixes the unit to `cm`.
 */
import type { Observation } from 'fhir/r4';
import type { Height, HeightList } from '../../api/schemas/height';
import { createMeasurementObservation, dataAbsentReason, type MeasurementContext, metres } from './shared';

export function mapHeightToFHIR(height: Height, context: MeasurementContext): Observation {
  const value = metres(height.height);

  return createMeasurementObservation({
    context,
    scope: 'height',
    path: height.height_path,
    common: height,
    display: `Height ${height.height_path}`,
    bodySitePath: height.at_marker,
    derivedFromMarkers: [{ path: height.at_marker, role: 'At marker' }],
    ...(value ? { valueQuantity: value } : { dataAbsentReason: dataAbsentReason('error') })
  });
}

export function mapHeightListToFHIR(heights: HeightList, context: MeasurementContext): Observation[] {
  return heights.map((height) => mapHeightToFHIR(height, context));
}
