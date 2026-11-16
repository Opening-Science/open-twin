/**
 * WHAT: The shared measurement definitions: keys whose meaning is the same whichever connector emits them.
 * NOT:  Holds no codings, source preferences or reliability grades; connectors map their codings to these keys in their own declarations, and vendor-only concepts are defined by the connector that owns them.
 * GOVERNED BY: DECISIONS.md#d18; DECISIONS.md#d4
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Two concepts that sound alike are two keys. Time in bed is not time asleep, a minimum during sleep is not a resting rate, and a daily total is not a reading — merging them here would merge them for every consumer.
 */
import type { MeasurementDefinition } from './measurements';
import { UCUM } from './units';

/** Bumped whenever a shared definition is added, removed or changes meaning. */
export const MEASUREMENT_DEFINITIONS_VERSION = 1;

const SLEEP_TOTAL = { scope: 'sleep-period', statistic: 'total' } as const;

export const MEASUREMENT_DEFINITIONS = [
  // Sleep. Each is one sleep period, so a night and a nap on the same day stay apart.
  {
    key: 'total-sleep-time',
    description: 'Time asleep within one sleep period, excluding time awake in bed.',
    valueType: 'quantity',
    canonicalUnit: UCUM.MINUTE.code,
    context: SLEEP_TOTAL
  },
  {
    key: 'time-in-bed',
    description: 'Time in bed for one sleep period, asleep or awake. Not time asleep.',
    valueType: 'quantity',
    canonicalUnit: UCUM.MINUTE.code,
    context: SLEEP_TOTAL
  },
  {
    key: 'rem-sleep-duration',
    description: 'Time in REM sleep within one sleep period.',
    valueType: 'quantity',
    canonicalUnit: UCUM.MINUTE.code,
    context: SLEEP_TOTAL
  },
  {
    key: 'light-sleep-duration',
    description: 'Time in light sleep within one sleep period.',
    valueType: 'quantity',
    canonicalUnit: UCUM.MINUTE.code,
    context: SLEEP_TOTAL
  },
  {
    key: 'deep-sleep-duration',
    description: 'Time in deep sleep within one sleep period.',
    valueType: 'quantity',
    canonicalUnit: UCUM.MINUTE.code,
    context: SLEEP_TOTAL
  },
  {
    key: 'sleep-latency',
    description: 'Time taken to fall asleep at the start of one sleep period.',
    valueType: 'quantity',
    canonicalUnit: UCUM.MINUTE.code,
    context: { scope: 'sleep-period' }
  },
  {
    key: 'sleep-minimum-heart-rate',
    description: 'Lowest heart rate during one sleep period. Not a resting heart rate, which is measured awake.',
    valueType: 'quantity',
    canonicalUnit: UCUM.PER_MINUTE.code,
    context: { scope: 'sleep-period', statistic: 'minimum' }
  },
  {
    key: 'sleep-mean-heart-rate',
    description: 'Mean heart rate over one sleep period.',
    valueType: 'quantity',
    canonicalUnit: UCUM.PER_MINUTE.code,
    context: { scope: 'sleep-period', statistic: 'mean' }
  },
  {
    key: 'sleep-mean-respiratory-rate',
    description: 'Mean respiratory rate over one sleep period.',
    valueType: 'quantity',
    canonicalUnit: UCUM.PER_MINUTE.code,
    context: { scope: 'sleep-period', statistic: 'mean' }
  },

  // Cardiorespiratory readings and daily summaries.
  {
    key: 'heart-rate',
    description: 'One heart rate reading at an instant or over a short sampling window.',
    valueType: 'quantity',
    canonicalUnit: UCUM.PER_MINUTE.code,
    context: { scope: 'reading' }
  },
  {
    key: 'resting-heart-rate',
    description: 'Resting heart rate for one calendar day, as the source computes it. Not the minimum during sleep.',
    valueType: 'quantity',
    canonicalUnit: UCUM.PER_MINUTE.code,
    context: { scope: 'daily' }
  },
  {
    key: 'respiratory-rate',
    description: 'One respiratory rate reading at an instant or over a short sampling window.',
    valueType: 'quantity',
    canonicalUnit: UCUM.PER_MINUTE.code,
    context: { scope: 'reading' }
  },
  {
    key: 'oxygen-saturation',
    description: 'One peripheral oxygen saturation reading by pulse oximetry, as a percentage.',
    valueType: 'quantity',
    canonicalUnit: UCUM.PERCENT.code,
    context: { scope: 'reading' }
  },
  {
    key: 'vo2max',
    description: 'Peak oxygen consumption per kilogram of body weight, as one reading or estimate.',
    valueType: 'quantity',
    canonicalUnit: UCUM.ML_PER_KG_PER_MIN.code,
    context: { scope: 'reading' }
  },

  // Body measurements.
  {
    key: 'body-height',
    description: 'One body height measurement.',
    valueType: 'quantity',
    canonicalUnit: UCUM.CENTIMETRE.code,
    context: { scope: 'reading' }
  },
  {
    key: 'body-weight',
    description: 'One body weight measurement.',
    valueType: 'quantity',
    canonicalUnit: UCUM.KILOGRAM.code,
    context: { scope: 'reading' }
  },
  {
    key: 'body-fat-percentage',
    description: 'One body fat percentage measurement.',
    valueType: 'quantity',
    canonicalUnit: UCUM.PERCENT.code,
    context: { scope: 'reading' }
  },
  {
    key: 'body-temperature',
    description: 'One absolute body temperature measurement. Never a deviation from a baseline.',
    valueType: 'quantity',
    canonicalUnit: UCUM.CELSIUS.code,
    context: { scope: 'reading' }
  },
  {
    key: 'blood-glucose-mass-concentration',
    description: 'One blood glucose measurement as a mass concentration.',
    valueType: 'quantity',
    canonicalUnit: UCUM.MG_PER_DL.code,
    context: { scope: 'reading' }
  },

  // Activity.
  {
    key: 'daily-step-count',
    description: 'Steps taken over one calendar day.',
    valueType: 'quantity',
    canonicalUnit: UCUM.STEPS_PER_DAY.code,
    context: { scope: 'daily', statistic: 'total' }
  },
  {
    key: 'step-count',
    description: 'Steps taken over one interval that is not a calendar day, session or sleep period.',
    valueType: 'quantity',
    canonicalUnit: UCUM.STEPS.code,
    context: { scope: 'interval', statistic: 'total' }
  },
  {
    key: 'session-step-count',
    description: 'Steps taken during one exercise or activity session.',
    valueType: 'quantity',
    canonicalUnit: UCUM.STEPS.code,
    context: { scope: 'session', statistic: 'total' }
  },
  {
    key: 'daily-energy-expenditure',
    description: 'Total energy expended over one calendar day, active and basal together.',
    valueType: 'quantity',
    canonicalUnit: 'kcal/(24.h)',
    context: { scope: 'daily', statistic: 'total' }
  },
  {
    key: 'session-energy-expenditure',
    description: 'Energy expended during one exercise or activity session.',
    valueType: 'quantity',
    canonicalUnit: UCUM.KILOCALORIE.code,
    context: { scope: 'session', statistic: 'total' }
  },
  {
    key: 'exercise-duration',
    description: 'Duration of one exercise or activity session.',
    valueType: 'quantity',
    canonicalUnit: UCUM.MINUTE.code,
    context: { scope: 'session', statistic: 'total' }
  }
] as const satisfies readonly MeasurementDefinition[];

export type SharedMeasurementKey = (typeof MEASUREMENT_DEFINITIONS)[number]['key'];
