/**
 * WHAT: Declares every measurement the Open Wearables connector emits — one declaration per mapped series measure, per sleep and workout Observation, and per component they carry.
 * NOT:  Converts nothing, chooses no codes and asserts no LOINC/SNOMED; seriesMap.ts and the mappers own codes, units and values, and this file only describes them.
 * GOVERNED BY: DECISIONS.md#d18
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Several series Observations carry two LOINC codings, and some LOINC codings are shared between measurements (8867-4 by `heart_rate` and `resting_heart_rate`, 55411-3 by `exercise_time` and a workout). Each declaration therefore names the one coding that only its measurement carries — the vendor-local one where there is one, otherwise the first (most specific) LOINC coding — and never a coding another measurement also carries.
 */
import {
  declareMeasurement,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementCoding,
  type MeasurementContext,
  type MeasurementDeclaration,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  type MeasurementValueType,
  type SharedMeasurementKey,
  UCUM
} from '@open-twin/fhir-core';
import { CONNECTOR, OPEN_WEARABLES_SYSTEM } from '../config/constants';
import {
  AWAKE,
  DEEP_SLEEP,
  EFFICIENCY,
  LIGHT_SLEEP,
  REM_SLEEP,
  SESSION_DURATION,
  SESSION_KIND,
  SLEEP_DURATION
} from './mappers/sleep';
import {
  CALORIES,
  DISTANCE,
  ELEVATION_GAIN,
  HR_AVERAGE,
  HR_MAXIMUM,
  WORKOUT_DURATION,
  WORKOUT_LABEL,
  WORKOUT_TYPE
} from './mappers/workout';
import { type Measure, SERIES_MAP } from './seriesMap';

const PREFIX = `${CONNECTOR.connector}:`;

const READING: MeasurementContext = { scope: 'reading' };
const INTERVAL_TOTAL: MeasurementContext = { scope: 'interval', statistic: 'total' };
const INTERVAL_MEAN: MeasurementContext = { scope: 'interval', statistic: 'mean' };
const DAILY_TOTAL: MeasurementContext = { scope: 'daily', statistic: 'total' };
const SESSION: MeasurementContext = { scope: 'session' };
const SESSION_TOTAL: MeasurementContext = { scope: 'session', statistic: 'total' };
const SLEEP_PERIOD: MeasurementContext = { scope: 'sleep-period' };
const SLEEP_TOTAL: MeasurementContext = { scope: 'sleep-period', statistic: 'total' };

function defineOwnedMeasurement(
  name: string,
  description: string,
  valueType: MeasurementValueType,
  canonicalUnit: string | undefined,
  context: MeasurementContext
): MeasurementDefinition {
  return {
    key: `${PREFIX}${name}`,
    description,
    valueType,
    ...(canonicalUnit ? { canonicalUnit } : {}),
    context
  };
}

/** A quantity whose canonical unit is the one the series measure emits. */
function defineOwnedSeriesMeasurement(
  name: string,
  description: string,
  measure: Measure | undefined,
  context: MeasurementContext
): MeasurementDefinition {
  if (!measure) throw new TypeError(`No series measure for ${PREFIX}${name}`);
  return defineOwnedMeasurement(name, description, 'quantity', measure.unit.code, context);
}

/* -------------------------------------------------------------------------- */
/* Time series (seriesMap.ts)                                                 */
/* -------------------------------------------------------------------------- */

type SeriesDeclaration = MeasurementDefinition | SharedMeasurementKey;

interface SeriesEntry {
  /** Used when `is_daily_total` is not `true`; every sample is emitted with `effectiveDateTime` only. */
  sample: SeriesDeclaration;
  /** Used when `is_daily_total === true`. Present exactly when `SERIES_MAP` has a `dailyTotal`. */
  dailyTotal?: SeriesDeclaration;
}

const S = SERIES_MAP;

/**
 * One entry per `SERIES_MAP` key. `SERIES_MAP` is a closed table — a type absent
 * from it is refused, never emitted — so this mirrors it exactly, and a test fails
 * if the two drift apart.
 *
 * A sample is a `reading` when it is a property at an instant or over a short
 * window, and an `interval` total or mean when it accumulates over the provider's
 * sampling interval; the mapper emits both as a point in time, so the scope comes
 * from what the series type measures, not from the FHIR timing element.
 */
const SERIES_DECLARATIONS: Readonly<Record<string, SeriesEntry>> = {
  // ---------------------------------------------------------------- vital signs
  heart_rate: { sample: 'heart-rate' },
  // The shared `resting-heart-rate` is a daily value. The mapper emits this as one
  // reading at a timestamp, with no daily semantics, so it is not stretched to fit.
  resting_heart_rate: {
    sample: defineOwnedSeriesMeasurement(
      'resting-heart-rate',
      'One resting heart rate value as the originating provider reports it, emitted as a reading at a timestamp. Not asserted to be a calendar-day value.',
      S.resting_heart_rate?.sample,
      READING
    )
  },
  respiratory_rate: { sample: 'respiratory-rate' },
  oxygen_saturation: { sample: 'oxygen-saturation' },
  body_temperature: { sample: 'body-temperature' },
  height: { sample: 'body-height' },
  weight: { sample: 'body-weight' },

  // --------------------------------------------------- other LOINC-coded measures
  body_fat_percentage: { sample: 'body-fat-percentage' },
  vo2_max: { sample: 'vo2max' },
  exercise_time: {
    sample: defineOwnedSeriesMeasurement(
      'exercise-time',
      'Minutes of exercise accumulated over one provider sampling interval (the `exercise_time` series). Not the duration of one workout session.',
      S.exercise_time?.sample,
      INTERVAL_TOTAL
    )
  },
  steps: { sample: 'step-count', dailyTotal: 'daily-step-count' },
  energy: {
    sample: defineOwnedSeriesMeasurement(
      'energy-burned',
      'Energy burned over one provider sampling interval (the `energy` series, which providers report as active energy). Neither basal energy nor a daily total.',
      S.energy?.sample,
      INTERVAL_TOTAL
    ),
    // Not the shared `daily-energy-expenditure`: that is active and basal together in
    // kcal/(24.h), whereas this is active energy in kcal.
    dailyTotal: defineOwnedSeriesMeasurement(
      'energy-burned-24h',
      'Active energy burned over one calendar day, as the platform reports it for `energy` with `is_daily_total`. Excludes basal energy.',
      S.energy?.dailyTotal,
      DAILY_TOTAL
    )
  },

  // ------------------------------------------------------------ vendor-local codes
  heart_rate_variability_sdnn: {
    sample: defineOwnedSeriesMeasurement(
      'hrv-sdnn',
      'One heart rate variability reading as SDNN, the standard deviation of normal-to-normal intervals.',
      S.heart_rate_variability_sdnn?.sample,
      READING
    )
  },
  heart_rate_variability_rmssd: {
    sample: defineOwnedSeriesMeasurement(
      'hrv-rmssd',
      'One heart rate variability reading as RMSSD, the root mean square of successive differences.',
      S.heart_rate_variability_rmssd?.sample,
      READING
    )
  },
  heart_rate_recovery_one_minute: {
    sample: defineOwnedSeriesMeasurement(
      'heart-rate-recovery-1min',
      'Heart rate recovery one minute after exertion, as one reading.',
      S.heart_rate_recovery_one_minute?.sample,
      READING
    )
  },
  walking_heart_rate_average: {
    sample: defineOwnedSeriesMeasurement(
      'walking-heart-rate-average',
      'Mean heart rate while walking over one provider sampling interval. Not a single heart rate reading.',
      S.walking_heart_rate_average?.sample,
      INTERVAL_MEAN
    )
  },
  skin_temperature: {
    sample: defineOwnedSeriesMeasurement(
      'skin-temperature',
      'One absolute skin temperature reading. Skin is a different site from body temperature.',
      S.skin_temperature?.sample,
      READING
    )
  },
  skin_temperature_deviation: {
    sample: defineOwnedSeriesMeasurement(
      'skin-temperature-deviation',
      'One skin temperature deviation from the provider baseline, a temperature difference. Never an absolute temperature.',
      S.skin_temperature_deviation?.sample,
      READING
    )
  },
  skin_temperature_trend_deviation: {
    sample: defineOwnedSeriesMeasurement(
      'skin-temperature-trend-deviation',
      'One skin temperature trend deviation from the provider baseline, a temperature difference. Never an absolute temperature.',
      S.skin_temperature_trend_deviation?.sample,
      READING
    )
  },
  lean_body_mass: {
    sample: defineOwnedSeriesMeasurement(
      'lean-body-mass',
      'One lean body mass measurement.',
      S.lean_body_mass?.sample,
      READING
    )
  },
  body_fat_mass: {
    sample: defineOwnedSeriesMeasurement(
      'body-fat-mass',
      'One body fat mass measurement, as a mass. Not a body fat percentage.',
      S.body_fat_mass?.sample,
      READING
    )
  },
  skeletal_muscle_mass: {
    sample: defineOwnedSeriesMeasurement(
      'skeletal-muscle-mass',
      'One skeletal muscle mass measurement.',
      S.skeletal_muscle_mass?.sample,
      READING
    )
  },
  waist_circumference: {
    sample: defineOwnedSeriesMeasurement(
      'waist-circumference',
      'One waist circumference measurement.',
      S.waist_circumference?.sample,
      READING
    )
  },
  cardiovascular_age: {
    sample: defineOwnedSeriesMeasurement(
      'cardiovascular-age',
      'One provider estimate of cardiovascular age, in years. Not a vascular stiffness index.',
      S.cardiovascular_age?.sample,
      READING
    )
  },
  garmin_fitness_age: {
    sample: defineOwnedSeriesMeasurement(
      'garmin-fitness-age',
      'One Garmin fitness age estimate, in years. A vendor estimate, not a measurement.',
      S.garmin_fitness_age?.sample,
      READING
    )
  },

  // ------------------------------------------------------------------- activity
  basal_energy: {
    sample: defineOwnedSeriesMeasurement(
      'basal-energy',
      'Basal energy burned over one provider sampling interval. Not active energy.',
      S.basal_energy?.sample,
      INTERVAL_TOTAL
    )
  },
  active_time: {
    sample: defineOwnedSeriesMeasurement(
      'active-time',
      'Provider-reported active time accumulated over one provider sampling interval.',
      S.active_time?.sample,
      INTERVAL_TOTAL
    )
  },
  stand_time: {
    sample: defineOwnedSeriesMeasurement(
      'stand-time',
      'Time spent standing over one provider sampling interval.',
      S.stand_time?.sample,
      INTERVAL_TOTAL
    )
  },
  flights_climbed: {
    sample: defineOwnedSeriesMeasurement(
      'flights-climbed',
      'Flights of stairs climbed over one provider sampling interval.',
      S.flights_climbed?.sample,
      INTERVAL_TOTAL
    )
  },
  distance_walking_running: {
    sample: defineOwnedSeriesMeasurement(
      'distance-walking-running',
      'Walking and running distance over one provider sampling interval.',
      S.distance_walking_running?.sample,
      INTERVAL_TOTAL
    )
  },
  distance_cycling: {
    sample: defineOwnedSeriesMeasurement(
      'distance-cycling',
      'Cycling distance over one provider sampling interval.',
      S.distance_cycling?.sample,
      INTERVAL_TOTAL
    )
  },
  distance_swimming: {
    sample: defineOwnedSeriesMeasurement(
      'distance-swimming',
      'Swimming distance over one provider sampling interval.',
      S.distance_swimming?.sample,
      INTERVAL_TOTAL
    )
  },
  distance_downhill_snow_sports: {
    sample: defineOwnedSeriesMeasurement(
      'distance-downhill-snow-sports',
      'Downhill snow sports distance over one provider sampling interval.',
      S.distance_downhill_snow_sports?.sample,
      INTERVAL_TOTAL
    )
  },
  distance_other: {
    sample: defineOwnedSeriesMeasurement(
      'distance-other',
      'Distance not attributed to another activity over one provider sampling interval.',
      S.distance_other?.sample,
      INTERVAL_TOTAL
    )
  },
  six_minute_walk_test_distance: {
    sample: defineOwnedSeriesMeasurement(
      'six-minute-walk-test-distance',
      'Distance covered in one six-minute walk test, as one result.',
      S.six_minute_walk_test_distance?.sample,
      READING
    )
  },
  underwater_depth: {
    sample: defineOwnedSeriesMeasurement(
      'underwater-depth',
      'One underwater depth reading.',
      S.underwater_depth?.sample,
      READING
    )
  },
  speed: {
    sample: defineOwnedSeriesMeasurement('speed', 'One speed reading, activity unspecified.', S.speed?.sample, READING)
  },
  walking_speed: {
    sample: defineOwnedSeriesMeasurement(
      'walking-speed',
      'One walking speed reading.',
      S.walking_speed?.sample,
      READING
    )
  },
  running_speed: {
    sample: defineOwnedSeriesMeasurement(
      'running-speed',
      'One running speed reading.',
      S.running_speed?.sample,
      READING
    )
  },
  running_ground_contact_time: {
    sample: defineOwnedSeriesMeasurement(
      'running-ground-contact-time',
      'One running ground contact time reading.',
      S.running_ground_contact_time?.sample,
      READING
    )
  },
  running_vertical_oscillation: {
    sample: defineOwnedSeriesMeasurement(
      'running-vertical-oscillation',
      'One running vertical oscillation reading.',
      S.running_vertical_oscillation?.sample,
      READING
    )
  },
  swimming_stroke_count: {
    sample: defineOwnedSeriesMeasurement(
      'swimming-stroke-count',
      'Swimming strokes over one provider sampling interval.',
      S.swimming_stroke_count?.sample,
      INTERVAL_TOTAL
    )
  },
  push_count: {
    sample: defineOwnedSeriesMeasurement(
      'push-count',
      'Wheelchair pushes over one provider sampling interval.',
      S.push_count?.sample,
      INTERVAL_TOTAL
    )
  },
  time_in_daylight: {
    sample: defineOwnedSeriesMeasurement(
      'time-in-daylight',
      'Time spent in daylight over one provider sampling interval.',
      S.time_in_daylight?.sample,
      INTERVAL_TOTAL
    )
  },
  walking_double_support_percentage: {
    sample: defineOwnedSeriesMeasurement(
      'walking-double-support-percentage',
      'One reading of the share of walking time with both feet on the ground.',
      S.walking_double_support_percentage?.sample,
      READING
    )
  },
  walking_asymmetry_percentage: {
    sample: defineOwnedSeriesMeasurement(
      'walking-asymmetry-percentage',
      'One reading of the share of steps with asymmetric gait.',
      S.walking_asymmetry_percentage?.sample,
      READING
    )
  },
  walking_steadiness: {
    sample: defineOwnedSeriesMeasurement(
      'walking-steadiness',
      'One provider walking steadiness rating, as a percentage.',
      S.walking_steadiness?.sample,
      READING
    )
  },
  average_met: {
    sample: defineOwnedSeriesMeasurement(
      'average-met',
      'Mean metabolic equivalent over one provider sampling interval.',
      S.average_met?.sample,
      INTERVAL_MEAN
    )
  },

  // --------------------------------------------------------------------- scores
  garmin_stress_level: {
    sample: defineOwnedSeriesMeasurement(
      'garmin-stress-level',
      'One Garmin stress score. A vendor score, not a physiological measurement.',
      S.garmin_stress_level?.sample,
      READING
    )
  },
  workout_effort_score: {
    sample: defineOwnedSeriesMeasurement(
      'workout-effort-score',
      'One provider workout effort score. A vendor score.',
      S.workout_effort_score?.sample,
      READING
    )
  },
  estimated_workout_effort_score: {
    sample: defineOwnedSeriesMeasurement(
      'estimated-workout-effort-score',
      'One provider-estimated workout effort score. A vendor score, distinct from a user-reported effort score.',
      S.estimated_workout_effort_score?.sample,
      READING
    )
  },
  number_of_times_fallen: {
    sample: defineOwnedSeriesMeasurement(
      'number-of-times-fallen',
      'Falls detected over one provider sampling interval.',
      S.number_of_times_fallen?.sample,
      INTERVAL_TOTAL
    )
  }
};

/**
 * The coding that identifies a series measure: its vendor-local coding when it
 * carries one, otherwise its first (most specific) coding. The second LOINC coding
 * of a two-coded measure is the profile's required "magic" code, which other
 * measures can carry too, so it is never the identifier.
 */
export function identifyingCoding(measure: Measure): MeasurementCoding {
  const coding = measure.codes.find((candidate) => candidate.system === OPEN_WEARABLES_SYSTEM) ?? measure.codes[0];
  if (!coding) throw new TypeError('Series measure carries no coding');
  return { system: coding.system, code: coding.code };
}

function seriesDeclarations(): { definitions: MeasurementDefinition[]; declarations: MeasurementDeclaration[] } {
  const definitions: MeasurementDefinition[] = [];
  const declarations: MeasurementDeclaration[] = [];
  const add = (declaration: SeriesDeclaration, measure: Measure): void => {
    if (typeof declaration !== 'string') definitions.push(declaration);
    declarations.push(declareMeasurement(declaration, identifyingCoding(measure)));
  };
  for (const [type, mapping] of Object.entries(SERIES_MAP)) {
    const entry = SERIES_DECLARATIONS[type];
    if (!entry) throw new TypeError(`Series type ${type} has no measurement declaration`);
    add(entry.sample, mapping.sample);
    if (mapping.dailyTotal) {
      if (!entry.dailyTotal) throw new TypeError(`Series type ${type} has no daily-total declaration`);
      add(entry.dailyTotal, mapping.dailyTotal);
    }
  }
  return { definitions, declarations };
}

/* -------------------------------------------------------------------------- */
/* Sleep sessions (mappers/sleep.ts)                                          */
/* -------------------------------------------------------------------------- */

const SLEEP_AWAKE = defineOwnedMeasurement(
  'sleep.awake-duration',
  'Time awake within one sleep period, from the session stage summary.',
  'quantity',
  UCUM.MINUTE.code,
  SLEEP_TOTAL
);
const SLEEP_SESSION_DURATION = defineOwnedMeasurement(
  'sleep.session-duration',
  'Wall-clock length of one sleep session event, start to end. Neither time asleep nor asserted to be time in bed.',
  'quantity',
  UCUM.MINUTE.code,
  SLEEP_TOTAL
);
const SLEEP_EFFICIENCY = defineOwnedMeasurement(
  'sleep.efficiency',
  'Provider-reported sleep efficiency for one sleep period, as a percentage.',
  'quantity',
  UCUM.PERCENT.code,
  SLEEP_PERIOD
);
const SLEEP_SESSION_KIND = defineOwnedMeasurement(
  'sleep.session-kind',
  'Whether one sleep period is a main sleep or a nap, as a code.',
  'codeable-concept',
  undefined,
  SLEEP_PERIOD
);

/* -------------------------------------------------------------------------- */
/* Workouts (mappers/workout.ts)                                              */
/* -------------------------------------------------------------------------- */

const WORKOUT_TYPE_DEFINITION = defineOwnedMeasurement(
  'workout.type',
  "One workout's activity type, as the platform's normalised workout type code.",
  'codeable-concept',
  undefined,
  SESSION
);
const WORKOUT_LABEL_DEFINITION = defineOwnedMeasurement(
  'workout.label',
  "One workout's free-text name, as the provider or user labelled it.",
  'string',
  undefined,
  SESSION
);
const WORKOUT_DISTANCE = defineOwnedMeasurement(
  'workout.distance',
  'Distance covered during one workout session.',
  'quantity',
  UCUM.METRE.code,
  SESSION_TOTAL
);
const WORKOUT_ELEVATION_GAIN = defineOwnedMeasurement(
  'workout.elevation-gain',
  'Elevation gained during one workout session.',
  'quantity',
  UCUM.METRE.code,
  SESSION_TOTAL
);
const WORKOUT_HEART_RATE_AVERAGE = defineOwnedMeasurement(
  'workout.heart-rate-average',
  'Mean heart rate over one workout session. Not a single heart rate reading.',
  'quantity',
  UCUM.PER_MINUTE.code,
  { scope: 'session', statistic: 'mean' }
);
const WORKOUT_HEART_RATE_MAXIMUM = defineOwnedMeasurement(
  'workout.heart-rate-maximum',
  'Highest heart rate during one workout session. Not a 24-hour maximum.',
  'quantity',
  UCUM.PER_MINUTE.code,
  { scope: 'session', statistic: 'maximum' }
);

const series = seriesDeclarations();

export const OPEN_WEARABLES_MEASUREMENTS: MeasurementDeclarationSet = {
  schemaVersion: MEASUREMENT_SCHEMA_VERSION,
  connector: CONNECTOR.connector,
  version: 1,
  coverage: 'complete',
  definitions: [
    ...series.definitions,
    SLEEP_AWAKE,
    SLEEP_SESSION_DURATION,
    SLEEP_EFFICIENCY,
    SLEEP_SESSION_KIND,
    WORKOUT_TYPE_DEFINITION,
    WORKOUT_LABEL_DEFINITION,
    WORKOUT_DISTANCE,
    WORKOUT_ELEVATION_GAIN,
    WORKOUT_HEART_RATE_AVERAGE,
    WORKOUT_HEART_RATE_MAXIMUM
  ],
  declarations: [
    ...series.declarations,

    // Sleep: `sleep_duration_seconds` is time asleep, published in minutes.
    declareMeasurement('total-sleep-time', SLEEP_DURATION),
    declareMeasurement('deep-sleep-duration', DEEP_SLEEP, SLEEP_DURATION),
    declareMeasurement('light-sleep-duration', LIGHT_SLEEP, SLEEP_DURATION),
    declareMeasurement('rem-sleep-duration', REM_SLEEP, SLEEP_DURATION),
    declareMeasurement(SLEEP_AWAKE, AWAKE, SLEEP_DURATION),
    declareMeasurement(SLEEP_SESSION_DURATION, SESSION_DURATION, SLEEP_DURATION),
    declareMeasurement(SLEEP_EFFICIENCY, EFFICIENCY, SLEEP_DURATION),
    declareMeasurement(SLEEP_SESSION_KIND, SESSION_KIND, SLEEP_DURATION),

    // Workout: identified by its local coding, because 55411-3 is also carried by an
    // `exercise_time` sample. Components are matched under the same parent coding.
    declareMeasurement('exercise-duration', WORKOUT_DURATION),
    declareMeasurement(WORKOUT_TYPE_DEFINITION, WORKOUT_TYPE, WORKOUT_DURATION),
    declareMeasurement(WORKOUT_LABEL_DEFINITION, WORKOUT_LABEL, WORKOUT_DURATION),
    declareMeasurement('session-energy-expenditure', CALORIES, WORKOUT_DURATION),
    declareMeasurement(WORKOUT_DISTANCE, DISTANCE, WORKOUT_DURATION),
    declareMeasurement(WORKOUT_ELEVATION_GAIN, ELEVATION_GAIN, WORKOUT_DURATION),
    declareMeasurement(WORKOUT_HEART_RATE_AVERAGE, HR_AVERAGE, WORKOUT_DURATION),
    declareMeasurement(WORKOUT_HEART_RATE_MAXIMUM, HR_MAXIMUM, WORKOUT_DURATION)
  ]
};
