/**
 * WHAT: Constructed fixture payload with one time-series sample for every series type the connector maps, plus a fully populated workout, for the measurement-declaration audit.
 * NOT:  Not a recorded vendor capture and not reproduced from the platform's example payloads; `openWearablesSync.ts` holds those. Values are plausible, not anyone's data.
 * GOVERNED BY: DECISIONS.md#d18
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Each sample uses the unit `SERIES_TYPE_DEFINITIONS` declares for its type (seriesMap.ts `declaredUnit`), because a sample in any other unit is refused and would prove nothing about what is emitted.
 */
import { FIXTURE_USER_ID } from './openWearablesSync';

/** A sample shaped as `TimeSeriesSample` (data_point_responses.py:11-20). */
function sample(type: string, unit: string, value: number, isDailyTotal: boolean | null = null): unknown {
  return {
    timestamp: '2024-03-04T07:30:00+00:00',
    zone_offset: '+01:00',
    type,
    value,
    unit,
    source: { provider: 'apple', device: 'Apple Watch Series 9' },
    is_daily_total: isDailyTotal
  };
}

/** `[series type, declared unit, value]` for every key of `SERIES_MAP`. */
const SAMPLES: readonly (readonly [string, string, number])[] = [
  ['heart_rate', 'bpm', 64],
  ['resting_heart_rate', 'bpm', 54],
  ['respiratory_rate', 'brpm', 13.5],
  ['oxygen_saturation', 'percent', 97],
  ['body_temperature', 'celsius', 36.7],
  ['height', 'cm', 172],
  ['weight', 'kg', 68.2],
  ['body_fat_percentage', 'percent', 21.4],
  ['vo2_max', 'ml_kg_min', 44.1],
  ['exercise_time', 'minutes', 12],
  ['steps', 'count', 640],
  ['energy', 'kcal', 38.5],
  ['heart_rate_variability_sdnn', 'ms', 52],
  ['heart_rate_variability_rmssd', 'ms', 41],
  ['heart_rate_recovery_one_minute', 'bpm', 24],
  ['walking_heart_rate_average', 'bpm', 98],
  ['skin_temperature', 'celsius', 33.9],
  ['skin_temperature_deviation', 'celsius', 0.2],
  ['skin_temperature_trend_deviation', 'celsius', -0.1],
  ['lean_body_mass', 'kg', 53.6],
  ['body_fat_mass', 'kg', 14.6],
  ['skeletal_muscle_mass', 'kg', 29.8],
  ['waist_circumference', 'cm', 81],
  ['cardiovascular_age', 'years', 39],
  ['garmin_fitness_age', 'years', 36],
  ['basal_energy', 'kcal', 64.2],
  ['active_time', 'minutes', 18],
  ['stand_time', 'minutes', 5],
  ['flights_climbed', 'count', 3],
  ['distance_walking_running', 'meters', 820],
  ['distance_cycling', 'meters', 4200],
  ['distance_swimming', 'meters', 750],
  ['distance_downhill_snow_sports', 'meters', 2300],
  ['distance_other', 'meters', 410],
  ['six_minute_walk_test_distance', 'meters', 560],
  ['underwater_depth', 'meters', 4.2],
  ['speed', 'm_per_s', 2.1],
  ['walking_speed', 'm_per_s', 1.35],
  ['running_speed', 'm_per_s', 3.2],
  ['running_ground_contact_time', 'ms', 245],
  ['running_vertical_oscillation', 'cm', 8.7],
  ['swimming_stroke_count', 'count', 36],
  ['push_count', 'count', 120],
  ['time_in_daylight', 'minutes', 22],
  ['walking_double_support_percentage', 'percent', 27.5],
  ['walking_asymmetry_percentage', 'percent', 3.1],
  ['walking_steadiness', 'percent', 88],
  ['average_met', 'met', 3.4],
  ['garmin_stress_level', 'score', 31],
  ['workout_effort_score', 'score', 6],
  ['estimated_workout_effort_score', 'score', 5],
  ['number_of_times_fallen', 'count', 1]
];

/** Series types `SERIES_MAP` maps as a daily total too (`is_daily_total: true`). */
const DAILY_TOTALS: readonly (readonly [string, string, number])[] = [
  ['steps', 'count', 9120],
  ['energy', 'kcal', 512]
];

export const COVERAGE_TIMESERIES_PAGE: unknown = {
  data: [
    ...SAMPLES.map(([type, unit, value]) => sample(type, unit, value)),
    ...DAILY_TOTALS.map(([type, unit, value]) => sample(type, unit, value, true))
  ],
  pagination: { next_cursor: null, previous_cursor: null, has_more: false, total_count: 54 }
};

/**
 * A workout with every optional field set, including `name`, which the reproduced
 * `WORKOUT_CREATED` payload omits and without which `workout-label` is never emitted.
 */
export const COVERAGE_WORKOUT_PAGE: unknown = {
  data: [
    {
      id: '00000000-0000-0000-0000-0000000000b1',
      user_id: FIXTURE_USER_ID,
      type: 'cycling',
      name: 'Morning ride',
      start_time: '2024-03-04T06:00:00+00:00',
      end_time: '2024-03-04T06:45:00+00:00',
      zone_offset: '+01:00',
      duration_seconds: 2700,
      source: { provider: 'apple', device: 'Apple Watch Series 9' },
      calories_kcal: 410,
      distance_meters: 18400,
      avg_heart_rate_bpm: 138,
      max_heart_rate_bpm: 166,
      avg_pace_sec_per_km: null,
      elevation_gain_meters: 210
    }
  ],
  pagination: { next_cursor: null, previous_cursor: null, has_more: false, total_count: 1 }
};
