/**
 * WHAT: Declares which measurements the Google Health API v4 connector emits — one declaration per Observation and per component its mappers can produce.
 * NOT:  Converts nothing, chooses no codes and asserts no LOINC/SNOMED; the mappers in ./mappers own codes, units and values, and this file only describes them.
 * GOVERNED BY: DECISIONS.md#d18
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Several Observations carry the same LOINC code (9279-1 daily and sleep respiratory rate, 94122-9 run and general VO2 max, 41981-2 active and basal energy, the pulse-oximetry code on spot and daily SpO2). They are declared by their google-health coding, never by the LOINC one — a LOINC-keyed declaration would match both and the audit would report it ambiguous.
 */
import {
  declareMeasurement,
  LOINC_CODINGS,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementCoding,
  type MeasurementContext,
  type MeasurementDeclaration,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  type MeasurementValueType,
  type SharedMeasurementKey,
  SYSTEMS,
  UCUM
} from '@open-twin/fhir-core';
import { CONNECTOR, GH_UCUM } from './mappers/shared';

/* -------------------------------------------------------------------------- */
/* Vendor enums behind dynamic component codes                                */
/* -------------------------------------------------------------------------- */

// The installed `health_v4` typings (googleapis 189.0.0, @googleapis/health 7.0.1) type
// every enum below as `string`; their doc comments name the values only partly
// ("Sleep stage type: AWAKE, DEEP, REM, LIGHT etc."; `SleepSummary.minutesAsleep`
// adds ASLEEP and RESTLESS). The complete lists are the `enum` arrays of the same
// schemas in the Google Health API v4 discovery document
// (https://health.googleapis.com/$discovery/rest?version=v4, revision 20261111).
// A value Google adds later is not declared, and the audit reports it as undeclared.

/** `HeartRateZone.heartRateZoneType`, read by `mapDailyHeartRateZonesToFHIR`. */
const HEART_RATE_ZONE_TYPES = ['HEART_RATE_ZONE_TYPE_UNSPECIFIED', 'LIGHT', 'MODERATE', 'VIGOROUS', 'PEAK'] as const;

/** `ActiveMinutesByActivityLevel.activityLevel`, read by `mapActiveMinutesToFHIR`. */
const ACTIVITY_LEVELS = ['ACTIVITY_LEVEL_UNSPECIFIED', 'LIGHT', 'MODERATE', 'VIGOROUS'] as const;

/** `StageSummary.type`, read by `mapSleepToFHIR` for `summary.stagesSummary`. */
const SLEEP_STAGE_TYPES = [
  'SLEEP_STAGE_TYPE_UNSPECIFIED',
  'AWAKE',
  'LIGHT',
  'DEEP',
  'REM',
  'ASLEEP',
  'RESTLESS'
] as const;

/** Both the zone and the activity-level mappers emit `unknown` when the vendor field is absent. */
const MISSING_ENUM = 'unknown';

/** The stages that are a shared concept; the rest stay connector-owned. */
const SHARED_SLEEP_STAGES: Partial<Record<(typeof SLEEP_STAGE_TYPES)[number], SharedMeasurementKey>> = {
  LIGHT: 'light-sleep-duration',
  DEEP: 'deep-sleep-duration',
  REM: 'rem-sleep-duration'
};

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

const READING: MeasurementContext = { scope: 'reading' };
const INTERVAL: MeasurementContext = { scope: 'interval' };
const INTERVAL_TOTAL: MeasurementContext = { scope: 'interval', statistic: 'total' };
const SESSION: MeasurementContext = { scope: 'session' };
const SESSION_TOTAL: MeasurementContext = { scope: 'session', statistic: 'total' };
const SESSION_MEAN: MeasurementContext = { scope: 'session', statistic: 'mean' };
const SLEEP_PERIOD: MeasurementContext = { scope: 'sleep-period' };
const SLEEP_TOTAL: MeasurementContext = { scope: 'sleep-period', statistic: 'total' };
const SLEEP_MEAN: MeasurementContext = { scope: 'sleep-period', statistic: 'mean' };
const DAILY: MeasurementContext = { scope: 'daily' };
const DAILY_MEAN: MeasurementContext = { scope: 'daily', statistic: 'mean' };

function googleHealthCoding(code: string): MeasurementCoding {
  return { system: SYSTEMS.GOOGLE_HEALTH, code };
}

/** `HEART_RATE_ZONE_TYPE_UNSPECIFIED` -> `heart-rate-zone-type-unspecified`; key segments are lower kebab-case. */
function keySegment(value: string): string {
  return value.toLowerCase().replace(/_/g, '-');
}

/** The mappers lower-case the vendor enum into the code and keep its underscores. */
function codeSegment(value: string): string {
  return value.toLowerCase();
}

const definitions: MeasurementDefinition[] = [];
const declarations: MeasurementDeclaration[] = [];

/** Defines a connector-owned measurement and declares it at one coding. */
function declareOwnedMeasurement(
  name: string,
  description: string,
  valueType: MeasurementValueType,
  unit: string | undefined,
  context: MeasurementContext,
  coding: MeasurementCoding,
  parent?: MeasurementCoding
): void {
  const definition: MeasurementDefinition = {
    key: `${CONNECTOR.connector}:${name}`,
    description,
    valueType,
    ...(unit !== undefined ? { canonicalUnit: unit } : {}),
    context
  };
  definitions.push(definition);
  declarations.push(declareMeasurement(definition, coding, parent));
}

/** Declares a shared measurement at one coding. */
function declareSharedMeasurement(
  key: SharedMeasurementKey,
  coding: MeasurementCoding,
  parent?: MeasurementCoding
): void {
  declarations.push(declareMeasurement(key, coding, parent));
}

/* -------------------------------------------------------------------------- */
/* daily.ts                                                                   */
/* -------------------------------------------------------------------------- */

const DAILY_HRV = googleHealthCoding('daily-heart-rate-variability');
declareOwnedMeasurement(
  'daily-heart-rate-variability',
  'Panel for one civil day of heart-rate-variability metrics (DailyHeartRateVariability). Carries no value; the metrics are its components.',
  'none',
  undefined,
  DAILY,
  DAILY_HRV
);
declareOwnedMeasurement(
  'daily-heart-rate-variability.average-rmssd',
  'Average heart rate variability for one civil day as RMSSD between heartbeats, in milliseconds.',
  'quantity',
  UCUM.MILLISECOND.code,
  DAILY_MEAN,
  googleHealthCoding('average-heart-rate-variability'),
  DAILY_HRV
);
declareOwnedMeasurement(
  'daily-heart-rate-variability.deep-sleep-rmssd',
  'RMSSD between heartbeats during deep sleep, reported for one civil day, in milliseconds.',
  'quantity',
  UCUM.MILLISECOND.code,
  DAILY,
  googleHealthCoding('deep-sleep-rmssd'),
  DAILY_HRV
);
declareOwnedMeasurement(
  'daily-heart-rate-variability.entropy',
  'Shannon entropy of the heartbeat-interval histogram for one civil day. Dimensionless; higher means higher HRV.',
  'quantity',
  UCUM.UNITY.code,
  DAILY,
  googleHealthCoding('entropy'),
  DAILY_HRV
);
declareOwnedMeasurement(
  'daily-heart-rate-variability.non-rem-heart-rate',
  'Heart rate during non-REM sleep, reported for one civil day. Not a resting heart rate.',
  'quantity',
  UCUM.PER_MINUTE.code,
  DAILY,
  googleHealthCoding('non-rem-heart-rate'),
  DAILY_HRV
);

const DAILY_ZONES = googleHealthCoding('daily-heart-rate-zones');
declareOwnedMeasurement(
  'daily-heart-rate-zones',
  "Panel for one civil day of the user's heart rate zone thresholds (Karvonen). Carries no value; the zone limits are its components.",
  'none',
  undefined,
  DAILY,
  DAILY_ZONES
);
for (const zone of [...HEART_RATE_ZONE_TYPES, MISSING_ENUM]) {
  const label = zone === MISSING_ENUM ? 'a zone whose type the API omitted' : `the ${zone} zone`;
  for (const [bound, limit] of [
    ['min', 'lower'],
    ['max', 'upper']
  ] as const) {
    declareOwnedMeasurement(
      `daily-heart-rate-zones.${keySegment(zone)}.${limit}-limit`,
      `Configured ${limit} heart-rate threshold of ${label} for one civil day. A zone boundary, not a measured ${bound === 'min' ? 'minimum' : 'maximum'} heart rate.`,
      'quantity',
      UCUM.PER_MINUTE.code,
      DAILY,
      googleHealthCoding(`heart-rate-zone-${codeSegment(zone)}-${bound}`),
      DAILY_ZONES
    );
  }
}

const DAILY_SPO2 = googleHealthCoding('daily-oxygen-saturation');
declareOwnedMeasurement(
  'daily-oxygen-saturation',
  "Average of one civil day's oxygen saturation samples, which Google takes during sleep. Not a spot reading.",
  'quantity',
  UCUM.PERCENT.code,
  DAILY_MEAN,
  DAILY_SPO2
);
declareOwnedMeasurement(
  'daily-oxygen-saturation.lower-bound',
  "Lower bound of the confidence interval of one civil day's oxygen saturation samples during sleep.",
  'quantity',
  UCUM.PERCENT.code,
  DAILY,
  googleHealthCoding('lower-bound-percentage'),
  DAILY_SPO2
);
declareOwnedMeasurement(
  'daily-oxygen-saturation.upper-bound',
  "Upper bound of the confidence interval of one civil day's oxygen saturation samples during sleep.",
  'quantity',
  UCUM.PERCENT.code,
  DAILY,
  googleHealthCoding('upper-bound-percentage'),
  DAILY_SPO2
);
declareOwnedMeasurement(
  'daily-oxygen-saturation.standard-deviation',
  'Standard deviation of the daily oxygen saturation averages over the preceding 7-30 days, reported on one civil day.',
  'quantity',
  UCUM.PERCENT.code,
  DAILY,
  googleHealthCoding('standard-deviation-percentage'),
  DAILY_SPO2
);

declareOwnedMeasurement(
  'daily-respiratory-rate',
  "Average respiratory rate for one civil day, which Google computes over that day's main sleep. Not a mean over the whole day.",
  'quantity',
  UCUM.PER_MINUTE.code,
  DAILY_MEAN,
  googleHealthCoding('daily-respiratory-rate')
);

declareSharedMeasurement('resting-heart-rate', { system: SYSTEMS.LOINC, code: '40443-4' });

const SLEEP_TEMPERATURE = googleHealthCoding('daily-sleep-temperature-derivations');
declareOwnedMeasurement(
  'daily-sleep-temperature-derivations',
  'Panel for one civil day of skin-temperature values derived during sleep. Carries no value; the derivations are its components.',
  'none',
  undefined,
  DAILY,
  SLEEP_TEMPERATURE
);
declareOwnedMeasurement(
  'daily-sleep-temperature-derivations.nightly-skin-temperature',
  "Mean of the skin temperature samples taken during one civil day's sleep. A skin temperature, not a body temperature.",
  'quantity',
  UCUM.CELSIUS.code,
  DAILY_MEAN,
  googleHealthCoding('nightly-temperature'),
  SLEEP_TEMPERATURE
);
declareOwnedMeasurement(
  'daily-sleep-temperature-derivations.baseline-skin-temperature',
  'Baseline skin temperature reported on one civil day: the median nightly skin temperature over the preceding 30 days.',
  'quantity',
  UCUM.CELSIUS.code,
  DAILY,
  googleHealthCoding('baseline-temperature'),
  SLEEP_TEMPERATURE
);
declareOwnedMeasurement(
  'daily-sleep-temperature-derivations.relative-nightly-stddev-30d',
  'Standard deviation of the nightly skin temperature relative to baseline over the preceding 30 days, as a temperature difference in kelvin.',
  'quantity',
  UCUM.KELVIN.code,
  DAILY,
  googleHealthCoding('relative-nightly-stddev-30d'),
  SLEEP_TEMPERATURE
);

const DAILY_VO2 = googleHealthCoding('daily-vo2-max');
declareOwnedMeasurement(
  'daily-vo2-max',
  "One civil day's VO2 max (cardio fitness score) as Google summarises it, in mL/kg/min. A daily rollup, not a single reading.",
  'quantity',
  UCUM.ML_PER_KG_PER_MIN.code,
  DAILY,
  DAILY_VO2
);
declareOwnedMeasurement(
  'daily-vo2-max.cardio-fitness-level',
  "Google's cardio fitness level category for one civil day, derived from VO2 max (POOR ... EXCELLENT).",
  'string',
  undefined,
  DAILY,
  googleHealthCoding('cardio-fitness-level'),
  DAILY_VO2
);
declareOwnedMeasurement(
  'daily-vo2-max.covariance',
  "Covariance of one civil day's VO2 max value, as the mapper emits it with the UCUM unity.",
  'quantity',
  UCUM.UNITY.code,
  DAILY,
  googleHealthCoding('vo2-max-covariance'),
  DAILY_VO2
);

/* -------------------------------------------------------------------------- */
/* interval.ts                                                                */
/* -------------------------------------------------------------------------- */

declareOwnedMeasurement(
  'active-energy-burned',
  'Energy burned through activity over one interval, excluding basal energy, in kilocalories.',
  'quantity',
  UCUM.KILOCALORIE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('active-energy-burned')
);
declareOwnedMeasurement(
  'basal-energy-burned',
  'Energy burned by basal metabolic rate over one interval, in kilocalories. Not active energy.',
  'quantity',
  UCUM.KILOCALORIE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('basal-energy-burned')
);

const ACTIVE_MINUTES = googleHealthCoding('active-minutes');
declareOwnedMeasurement(
  'active-minutes',
  'Panel for the active minutes of one interval. Carries no value; the minutes per activity level are its components.',
  'none',
  undefined,
  INTERVAL,
  ACTIVE_MINUTES
);
for (const level of [...ACTIVITY_LEVELS, MISSING_ENUM]) {
  const label = level === MISSING_ENUM ? 'an activity level the API omitted' : `activity level ${level}`;
  declareOwnedMeasurement(
    `active-minutes.${keySegment(level)}`,
    `Minutes spent at ${label} within one interval.`,
    'quantity',
    UCUM.MINUTE.code,
    INTERVAL_TOTAL,
    googleHealthCoding(`active-minutes-${codeSegment(level)}`),
    ACTIVE_MINUTES
  );
}

const ACTIVE_ZONE_MINUTES = googleHealthCoding('active-zone-minutes');
declareOwnedMeasurement(
  'active-zone-minutes',
  'Active Zone Minutes earned in one interval, emitted in minutes. Google counts 1 per minute in fat-burn and 2 per minute in cardio or peak, so this is not elapsed time.',
  'quantity',
  UCUM.MINUTE.code,
  INTERVAL_TOTAL,
  ACTIVE_ZONE_MINUTES
);
declareOwnedMeasurement(
  'active-zone-minutes.heart-rate-zone',
  'Heart rate zone (FAT_BURN, CARDIO, PEAK) in which the interval earned its Active Zone Minutes.',
  'string',
  undefined,
  INTERVAL,
  googleHealthCoding('heart-rate-zone'),
  ACTIVE_ZONE_MINUTES
);

const ACTIVITY_LEVEL = googleHealthCoding('activity-level');
declareOwnedMeasurement(
  'activity-level',
  'Activity level type (SEDENTARY, LIGHTLY_ACTIVE, ...) of one interval, as a google-health coded concept.',
  'codeable-concept',
  undefined,
  INTERVAL,
  ACTIVITY_LEVEL
);
declareOwnedMeasurement(
  'activity-level.duration',
  'Duration of the interval spent at the activity level, derived from its start and end.',
  'quantity',
  UCUM.MINUTE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('duration'),
  ACTIVITY_LEVEL
);

declareOwnedMeasurement(
  'elevation-gain',
  'Elevation gained over one interval, converted from the API millimetres to metres.',
  'quantity',
  UCUM.METRE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('altitude')
);
declareOwnedMeasurement(
  'distance',
  'Distance covered over one interval, converted from the API millimetres to metres.',
  'quantity',
  UCUM.METRE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('distance')
);
declareOwnedMeasurement(
  'floors',
  'Floors climbed over one interval.',
  'quantity',
  GH_UCUM.FLOORS.code,
  INTERVAL_TOTAL,
  googleHealthCoding('floors')
);
declareOwnedMeasurement(
  'sedentary-period',
  'Duration of one sedentary period, derived from its start and end.',
  'quantity',
  UCUM.MINUTE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('sedentary-period')
);

declareSharedMeasurement('step-count', { system: SYSTEMS.LOINC, code: '55423-8' });

const SWIM_LENGTHS = googleHealthCoding('swim-lengths-data');
declareOwnedMeasurement(
  'swim-stroke-count',
  'Swim strokes over one swim-length interval.',
  'quantity',
  GH_UCUM.STROKES.code,
  INTERVAL_TOTAL,
  SWIM_LENGTHS
);
declareOwnedMeasurement(
  'swim-stroke-count.stroke-type',
  'Swim stroke type (FREESTYLE, BACKSTROKE, ...) of one swim-length interval.',
  'string',
  undefined,
  INTERVAL,
  googleHealthCoding('swim-stroke-type'),
  SWIM_LENGTHS
);

const TIME_IN_ZONE = googleHealthCoding('time-in-heart-rate-zone');
declareOwnedMeasurement(
  'time-in-heart-rate-zone',
  'Time spent in one heart rate zone over one interval, derived from its start and end.',
  'quantity',
  UCUM.MINUTE.code,
  INTERVAL_TOTAL,
  TIME_IN_ZONE
);
declareOwnedMeasurement(
  'time-in-heart-rate-zone.zone-type',
  'Heart rate zone type (LIGHT, MODERATE, VIGOROUS, PEAK) the interval was spent in.',
  'string',
  undefined,
  INTERVAL,
  googleHealthCoding('heart-rate-zone-type'),
  TIME_IN_ZONE
);

/* -------------------------------------------------------------------------- */
/* sample.ts                                                                  */
/* -------------------------------------------------------------------------- */

const BLOOD_GLUCOSE = { system: SYSTEMS.LOINC, code: '2339-0' };
declareSharedMeasurement('blood-glucose-mass-concentration', BLOOD_GLUCOSE);
declareOwnedMeasurement(
  'blood-glucose.meal-type',
  'Meal the blood glucose reading relates to (BREAKFAST, LUNCH, ...).',
  'string',
  undefined,
  READING,
  googleHealthCoding('meal-type'),
  BLOOD_GLUCOSE
);
declareOwnedMeasurement(
  'blood-glucose.measurement-timing',
  'Timing of the blood glucose reading relative to a meal or sleep (FASTING, AFTER_MEAL, ...).',
  'string',
  undefined,
  READING,
  googleHealthCoding('measurement-timing'),
  BLOOD_GLUCOSE
);
declareOwnedMeasurement(
  'blood-glucose.specimen',
  'Specimen the blood glucose reading was taken from (CAPILLARY_BLOOD, INTERSTITIAL_FLUID, ...).',
  'string',
  undefined,
  READING,
  googleHealthCoding('specimen'),
  BLOOD_GLUCOSE
);

declareSharedMeasurement('body-fat-percentage', { system: SYSTEMS.LOINC, code: '41982-0' });

const BODY_TEMPERATURE = { system: SYSTEMS.LOINC, code: '8310-5' };
declareSharedMeasurement('body-temperature', BODY_TEMPERATURE);
declareOwnedMeasurement(
  'core-body-temperature.measurement-location',
  'Body site of one core body temperature reading (ORAL, EAR, WRIST, ...).',
  'string',
  undefined,
  READING,
  googleHealthCoding('measurement-location'),
  BODY_TEMPERATURE
);

declareSharedMeasurement('heart-rate', LOINC_CODINGS.HEART_RATE);
declareOwnedMeasurement(
  'heart-rate.motion-context',
  'Motion context (ACTIVE, SEDENTARY) of one heart rate reading.',
  'string',
  undefined,
  READING,
  googleHealthCoding('motion-context'),
  LOINC_CODINGS.HEART_RATE
);
declareOwnedMeasurement(
  'heart-rate.sensor-location',
  'Body site of the sensor for one heart rate reading (WRIST, CHEST, ...).',
  'string',
  undefined,
  READING,
  googleHealthCoding('sensor-location'),
  LOINC_CODINGS.HEART_RATE
);

const HRV = googleHealthCoding('heart-rate-variability');
declareOwnedMeasurement(
  'heart-rate-variability',
  'One heart rate variability reading as RMSSD between normal heartbeats, in milliseconds.',
  'quantity',
  UCUM.MILLISECOND.code,
  READING,
  HRV
);
declareOwnedMeasurement(
  'heart-rate-variability.standard-deviation',
  'Standard deviation reported with one heart rate variability reading, in milliseconds. Google documents it only as "the standard deviation of the heart rate variability measurement"; the mapper labels it SDNN.',
  'quantity',
  UCUM.MILLISECOND.code,
  READING,
  googleHealthCoding('standard-deviation'),
  HRV
);

declareSharedMeasurement('body-height', { system: SYSTEMS.LOINC, code: '8302-2' });
declareSharedMeasurement('oxygen-saturation', googleHealthCoding('oxygen-saturation'));

const SLEEP_RESPIRATORY_RATE = googleHealthCoding('respiratory-rate-sleep-summary');
declareSharedMeasurement('sleep-mean-respiratory-rate', SLEEP_RESPIRATORY_RATE);
for (const [stage, label] of [
  ['deep', 'deep'],
  ['light', 'light'],
  ['rem', 'REM']
] as const) {
  declareOwnedMeasurement(
    `sleep-respiratory-rate.${stage}-sleep`,
    `Mean respiratory rate during ${label} sleep within one sleep period.`,
    'quantity',
    UCUM.PER_MINUTE.code,
    SLEEP_MEAN,
    googleHealthCoding(`${stage}-sleep-breaths-per-minute`),
    SLEEP_RESPIRATORY_RATE
  );
}

// Both are VO2 max estimates in mL/kg/min at an instant; only the estimation method
// differs, and that stays in `Observation.method`. The shared key fits each exactly.
declareSharedMeasurement('vo2max', googleHealthCoding('run-vo2-max'));
declareSharedMeasurement('vo2max', googleHealthCoding('vo2-max'));

declareSharedMeasurement('body-weight', { system: SYSTEMS.LOINC, code: '29463-7' });

/* -------------------------------------------------------------------------- */
/* session.ts                                                                 */
/* -------------------------------------------------------------------------- */

const ECG = googleHealthCoding('electrocardiogram');
declareOwnedMeasurement(
  'electrocardiogram',
  'Panel for one ECG recording session. Carries no value and no waveform; the session metrics are its components.',
  'none',
  undefined,
  SESSION,
  ECG
);
declareOwnedMeasurement(
  'electrocardiogram.average-heart-rate',
  'Average heart rate over one ECG recording.',
  'quantity',
  UCUM.PER_MINUTE.code,
  SESSION_MEAN,
  googleHealthCoding('average-heart-rate'),
  ECG
);
declareOwnedMeasurement(
  'electrocardiogram.result-classification',
  "The device's rhythm classification of one ECG recording (NORMAL_SINUS_RHYTHM, ATRIAL_FIBRILLATION, ...). Research use only; not a diagnosis.",
  'string',
  undefined,
  SESSION,
  googleHealthCoding('result-classification'),
  ECG
);
declareOwnedMeasurement(
  'electrocardiogram.sampling-frequency',
  'Sampling frequency of the waveform of one ECG recording.',
  'quantity',
  GH_UCUM.HERTZ.code,
  SESSION,
  googleHealthCoding('sampling-frequency-hertz'),
  ECG
);
declareOwnedMeasurement(
  'electrocardiogram.lead-count',
  'Number of leads used for one ECG recording.',
  'quantity',
  GH_UCUM.LEADS.code,
  SESSION,
  googleHealthCoding('lead-number'),
  ECG
);

const EXERCISE = googleHealthCoding('exercise');
declareOwnedMeasurement(
  'exercise',
  'Panel for one exercise session. Carries no value; the session summary metrics are its components.',
  'none',
  undefined,
  SESSION,
  EXERCISE
);
declareOwnedMeasurement(
  'exercise.exercise-type',
  'Exercise type of one session (RUNNING, SWIMMING, ...).',
  'string',
  undefined,
  SESSION,
  googleHealthCoding('exercise-type'),
  EXERCISE
);
declareSharedMeasurement('session-energy-expenditure', { system: SYSTEMS.LOINC, code: '41981-2' }, EXERCISE);
declareOwnedMeasurement(
  'exercise.distance',
  'Distance covered during one exercise session, converted from the API millimetres to metres.',
  'quantity',
  UCUM.METRE.code,
  SESSION_TOTAL,
  googleHealthCoding('distance'),
  EXERCISE
);
declareSharedMeasurement('session-step-count', { system: SYSTEMS.LOINC, code: '55423-8' }, EXERCISE);
declareOwnedMeasurement(
  'exercise.average-heart-rate',
  'Average heart rate over one exercise session.',
  'quantity',
  UCUM.PER_MINUTE.code,
  SESSION_MEAN,
  googleHealthCoding('average-heart-rate'),
  EXERCISE
);
declareOwnedMeasurement(
  'exercise.elevation-gain',
  'Elevation gained during one exercise session, converted from the API millimetres to metres.',
  'quantity',
  UCUM.METRE.code,
  SESSION_TOTAL,
  googleHealthCoding('elevation-gain'),
  EXERCISE
);
declareOwnedMeasurement(
  'exercise.active-zone-minutes',
  'Active Zone Minutes earned during one exercise session, emitted in minutes. Google counts 2 per minute in cardio or peak, so this is not elapsed time.',
  'quantity',
  UCUM.MINUTE.code,
  SESSION_TOTAL,
  googleHealthCoding('active-zone-minutes'),
  EXERCISE
);

declareOwnedMeasurement(
  'hydration',
  'Volume of fluid consumed in one hydration log entry, in millilitres.',
  'quantity',
  GH_UCUM.MILLILITRE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('hydration-log')
);

const IRREGULAR_RHYTHM = googleHealthCoding('irregular-rhythm-notification');
declareOwnedMeasurement(
  'irregular-rhythm-notification',
  'Panel for one irregular rhythm (possible AFib) notification over its analysis interval. Carries no value. Research use only; not a diagnosis.',
  'none',
  undefined,
  INTERVAL,
  IRREGULAR_RHYTHM
);
declareOwnedMeasurement(
  'irregular-rhythm-notification.alert-window-count',
  'Number of analysis windows that produced one irregular rhythm notification.',
  'quantity',
  GH_UCUM.WINDOWS.code,
  INTERVAL_TOTAL,
  googleHealthCoding('alert-window-count'),
  IRREGULAR_RHYTHM
);

const NUTRITION = googleHealthCoding('nutrition-log');
declareOwnedMeasurement(
  'nutrition-log',
  'Panel for one logged food intake. Carries no value; the meal and nutrient amounts are its components.',
  'none',
  undefined,
  INTERVAL,
  NUTRITION
);
declareOwnedMeasurement(
  'nutrition-log.meal-type',
  'Meal one logged food intake belongs to (BREAKFAST, SNACK, ...).',
  'string',
  undefined,
  INTERVAL,
  googleHealthCoding('meal-type'),
  NUTRITION
);
declareOwnedMeasurement(
  'nutrition-log.energy',
  'Energy intake of one logged food, in kilocalories.',
  'quantity',
  UCUM.KILOCALORIE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('energy'),
  NUTRITION
);
declareOwnedMeasurement(
  'nutrition-log.energy-from-fat',
  'Energy from fat in one logged food, in kilocalories.',
  'quantity',
  UCUM.KILOCALORIE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('energy-from-fat'),
  NUTRITION
);
declareOwnedMeasurement(
  'nutrition-log.total-carbohydrate',
  'Total carbohydrate in one logged food, in grams.',
  'quantity',
  UCUM.GRAM.code,
  INTERVAL_TOTAL,
  googleHealthCoding('total-carbohydrate'),
  NUTRITION
);
declareOwnedMeasurement(
  'nutrition-log.total-fat',
  'Total fat in one logged food, in grams.',
  'quantity',
  UCUM.GRAM.code,
  INTERVAL_TOTAL,
  googleHealthCoding('total-fat'),
  NUTRITION
);

const SLEEP = googleHealthCoding('sleep');
declareOwnedMeasurement(
  'sleep',
  'Panel for one sleep session (a night or a nap). Carries no value; the summary is its components and each stage segment a member Observation.',
  'none',
  undefined,
  SLEEP_PERIOD,
  SLEEP
);
declareSharedMeasurement('total-sleep-time', { system: SYSTEMS.LOINC, code: '93832-4' }, SLEEP);
declareOwnedMeasurement(
  'sleep.minutes-awake',
  'Minutes awake within one sleep period: the sum of its AWAKE stages.',
  'quantity',
  UCUM.MINUTE.code,
  SLEEP_TOTAL,
  googleHealthCoding('minutes-awake'),
  SLEEP
);
declareOwnedMeasurement(
  'sleep.minutes-after-wake-up',
  "Minutes after waking at the end of one sleep period, as Google's restlessness algorithm computes them.",
  'quantity',
  UCUM.MINUTE.code,
  SLEEP_PERIOD,
  googleHealthCoding('minutes-after-wake-up'),
  SLEEP
);
declareSharedMeasurement('time-in-bed', LOINC_CODINGS.TIME_IN_BED, SLEEP);
declareSharedMeasurement('sleep-latency', { system: SYSTEMS.LOINC, code: '103212-7' }, SLEEP);
for (const stage of SLEEP_STAGE_TYPES) {
  const coding = googleHealthCoding(`stage-minutes-${codeSegment(stage)}`);
  const sharedKey = SHARED_SLEEP_STAGES[stage];
  if (sharedKey) {
    declareSharedMeasurement(sharedKey, coding, SLEEP);
    continue;
  }
  declareOwnedMeasurement(
    `sleep.stage-minutes.${keySegment(stage)}`,
    `Minutes in sleep stage ${stage} within one sleep period, from the stage summary.`,
    'quantity',
    UCUM.MINUTE.code,
    SLEEP_TOTAL,
    coding,
    SLEEP
  );
}
declareOwnedMeasurement(
  'sleep.sleep-type',
  'Whether one sleep session was recorded as CLASSIC or STAGES sleep.',
  'string',
  undefined,
  SLEEP_PERIOD,
  googleHealthCoding('sleep-type'),
  SLEEP
);
declareOwnedMeasurement(
  'sleep.out-of-bed-segment-count',
  'Number of out-of-bed segments within one sleep period.',
  'quantity',
  GH_UCUM.SEGMENTS.code,
  SLEEP_TOTAL,
  googleHealthCoding('out-of-bed-segment-count'),
  SLEEP
);

const SLEEP_STAGE = googleHealthCoding('sleep-stage');
declareOwnedMeasurement(
  'sleep-stage',
  'One contiguous sleep stage segment of a sleep session, its stage type as a google-health coded concept.',
  'codeable-concept',
  undefined,
  INTERVAL,
  SLEEP_STAGE
);
declareOwnedMeasurement(
  'sleep-stage.duration',
  'Duration of one sleep stage segment, derived from its start and end.',
  'quantity',
  UCUM.MINUTE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('duration'),
  SLEEP_STAGE
);
declareOwnedMeasurement(
  'out-of-bed-segment',
  'Duration of one out-of-bed segment within a sleep session, derived from its start and end.',
  'quantity',
  UCUM.MINUTE.code,
  INTERVAL_TOTAL,
  googleHealthCoding('out-of-bed-segment')
);

/** Everything the Google Health API v4 connector emits, for the catalogue in `@open-twin/aggregate`. */
export const GOOGLE_HEALTH_MEASUREMENTS: MeasurementDeclarationSet = {
  schemaVersion: MEASUREMENT_SCHEMA_VERSION,
  connector: CONNECTOR.connector,
  version: 1,
  coverage: 'complete',
  definitions,
  declarations
};
