/**
 * WHAT: Maps one vendor record type into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: signed review record (verify/terminology-allowlist.json) for LOINC/SNOMED emitted here; UCUM gate for quantities.
 */
import {
  CATEGORY,
  codeableComponent,
  createObservation,
  dataAbsentReason,
  deterministicId,
  optionalNumericComponent,
  quantity,
  SYSTEMS,
  stringComponent,
  UCUM
} from '@open-twin/fhir-core';
import type { Observation } from 'fhir/r4';
import type { Workout } from '../../api/schemas/events';
import { CONNECTOR, OPEN_WEARABLES_IDENTIFIER_SYSTEM, OPEN_WEARABLES_SYSTEM } from '../../config/constants';
import { loincUnit } from '../seriesMap';
import { fhirDateTime } from '../time';
import type { SampleContext } from './timeseries';

const WORKOUT_TYPE = { system: OPEN_WEARABLES_SYSTEM, code: 'workout-type', display: 'Workout type' };
const WORKOUT_LABEL = { system: OPEN_WEARABLES_SYSTEM, code: 'workout-label', display: 'Workout label' };
const DISTANCE = { system: OPEN_WEARABLES_SYSTEM, code: 'workout-distance', display: 'Workout distance' };
const ELEVATION_GAIN = {
  system: OPEN_WEARABLES_SYSTEM,
  code: 'workout-elevation-gain',
  display: 'Workout elevation gain'
};
const HR_AVERAGE = {
  system: OPEN_WEARABLES_SYSTEM,
  code: 'workout-heart-rate-average',
  display: 'Average heart rate during workout'
};
const HR_MAXIMUM = {
  system: OPEN_WEARABLES_SYSTEM,
  code: 'workout-heart-rate-maximum',
  display: 'Maximum heart rate during workout'
};

/**
 * One workout becomes one Observation, coded as an exercise duration with the
 * workout's aggregates as components.
 *
 * Three deliberate refusals of standard codes:
 *
 *  - `avg_heart_rate_bpm` does **not** go out under LOINC 8867-4 "Heart rate". That
 *    concept is a point-in-time measurement; an average over an hour is a different
 *    property, and property mismatch is exactly the class of defect that put VO₂max
 *    and a run-derived estimate under one indistinguishable code in this repository.
 *  - `max_heart_rate_bpm` does not go out under LOINC 8873-2 "Heart rate 24 hour
 *    maximum" either: a workout is not 24 hours.
 *  - `avg_pace_sec_per_km` is dropped entirely. Its unit is seconds per kilometre,
 *    which `@open-twin/fhir-core` has no UCUM entry for, and pace is trivially
 *    recoverable from distance and duration, both of which are published here.
 *
 * TODO(clinical-review): the four vendor-local component codes above want either a
 * verified standard concept or sign-off that local codes are acceptable.
 */
export function mapWorkout(workout: Workout, context: SampleContext): Observation {
  const durationSeconds = workout.duration_seconds;
  const durationMinutes =
    durationSeconds === undefined || durationSeconds === null || !Number.isFinite(durationSeconds)
      ? undefined
      : Math.round((durationSeconds / 60) * 1000) / 1000;
  const value = quantity(durationMinutes, loincUnit('55411-3'));
  const device = context.devices.reference(workout.source);

  if (workout.avg_pace_sec_per_km !== undefined && workout.avg_pace_sec_per_km !== null) {
    context.issues.add(
      'workout:avg_pace_sec_per_km',
      'Workout average pace is not mapped',
      'avg_pace_sec_per_km: no UCUM entry for seconds per kilometre in @open-twin/fhir-core; recoverable from distance_meters and duration_seconds, both of which are mapped'
    );
  }

  return createObservation({
    id: deterministicId({
      connector: CONNECTOR.connector,
      subjectKey: context.subjectKey,
      recordId: workout.id,
      measure: 'workout'
    }),
    identifier: [{ system: OPEN_WEARABLES_IDENTIFIER_SYSTEM, value: `workout|${workout.id}` }],
    code: { system: SYSTEMS.LOINC, code: '55411-3', display: 'Exercise duration' },
    category: CATEGORY.ACTIVITY,
    subject: context.subject,
    effectivePeriod: {
      start: fhirDateTime(workout.start_time, workout.zone_offset),
      end: fhirDateTime(workout.end_time, workout.zone_offset)
    },
    ...(value ? { valueQuantity: value } : { dataAbsentReason: dataAbsentReason() }),
    components: [
      // The platform normalises ~80 provider activity names onto its own vocabulary
      // (docs/architecture/data-types.mdx). That vocabulary is a code, so it is
      // carried as one rather than as a free-text string a consumer must parse.
      codeableComponent(WORKOUT_TYPE, {
        system: OPEN_WEARABLES_SYSTEM,
        code: workout.type
      }),
      stringComponent(WORKOUT_LABEL, workout.name),
      // 41981-2 "Calories burned" is point-in-time, which is correct for a single
      // activity; the 24-hour code 41979-6 would not be.
      optionalNumericComponent(
        { system: SYSTEMS.LOINC, code: '41981-2', display: 'Calories burned' },
        workout.calories_kcal,
        loincUnit('41981-2')
      ),
      optionalNumericComponent(DISTANCE, workout.distance_meters, UCUM.METRE),
      optionalNumericComponent(ELEVATION_GAIN, workout.elevation_gain_meters, UCUM.METRE),
      optionalNumericComponent(HR_AVERAGE, workout.avg_heart_rate_bpm, UCUM.PER_MINUTE),
      optionalNumericComponent(HR_MAXIMUM, workout.max_heart_rate_bpm, UCUM.PER_MINUTE)
    ],
    ...(device ? { device } : {})
  });
}
