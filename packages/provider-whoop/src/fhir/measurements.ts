/**
 * WHAT: Declares every Observation and component the WHOOP mappers emit, keyed to shared or WHOOP-owned measurement definitions.
 * NOT:  Maps nothing and converts no unit; the mappers in ./mappers emit the values, and the audit in @open-twin/fhir-core checks them against this set.
 * GOVERNED BY: DECISIONS.md#d18
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Recovery's resting heart rate and the cycle's average heart rate both carry LOINC 8867-4, so each is declared by its WHOOP coding; declaring 8867-4 itself would make both ambiguous. WHOOP's resting heart rate is measured during sleep, so it is not the shared daily `resting-heart-rate`.
 */
import {
  declareMeasurement,
  LOINC_CODINGS,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  UCUM
} from '@open-twin/fhir-core';
import { CYCLE_CODINGS } from './mappers/cycle';
import { RECOVERY_CODINGS } from './mappers/recovery';
import { CONNECTOR } from './mappers/shared';
import { SLEEP_CODINGS } from './mappers/sleep';

const RECOVERY_SCORE = {
  key: 'whoop:recovery-score',
  description:
    'WHOOP Recovery score for one physiological cycle: a vendor-computed 0-100 readiness score. A WHOOP score, not a clinical measure.',
  valueType: 'quantity',
  canonicalUnit: UCUM.SCORE.code,
  context: { scope: 'physiological-cycle' }
} as const satisfies MeasurementDefinition;

const RECOVERY_HRV_RMSSD = {
  key: 'whoop:recovery.hrv-rmssd',
  description:
    'Heart rate variability as RMSSD that WHOOP measures during the sleep linked to a recovery and factors into its Recovery score.',
  valueType: 'quantity',
  canonicalUnit: UCUM.MILLISECOND.code,
  context: { scope: 'sleep-period' }
} as const satisfies MeasurementDefinition;

const RECOVERY_RESTING_HEART_RATE = {
  key: 'whoop:recovery.resting-heart-rate',
  description:
    'Resting heart rate as WHOOP computes it from the sleep linked to a recovery. Measured asleep and by an undocumented statistic, so neither a daily resting heart rate nor the minimum or mean during sleep.',
  valueType: 'quantity',
  canonicalUnit: UCUM.PER_MINUTE.code,
  context: { scope: 'sleep-period' }
} as const satisfies MeasurementDefinition;

const RECOVERY_SPO2 = {
  key: 'whoop:recovery.spo2',
  description:
    'Value-less panel grouping the blood oxygen saturation WHOOP reports with a recovery; the percentage is its component.',
  valueType: 'none',
  context: { scope: 'sleep-period' }
} as const satisfies MeasurementDefinition;

const RECOVERY_SPO2_PERCENTAGE = {
  key: 'whoop:recovery.spo2-percentage',
  description:
    'Blood oxygen saturation percentage WHOOP reports with a recovery, measured during its linked sleep. A summary over the sleep, not one pulse oximetry reading.',
  valueType: 'quantity',
  canonicalUnit: UCUM.PERCENT.code,
  context: { scope: 'sleep-period' }
} as const satisfies MeasurementDefinition;

const DAY_STRAIN = {
  key: 'whoop:cycle.day-strain',
  description: 'WHOOP day Strain for one physiological cycle: a vendor-computed 0-21 cardiovascular load score.',
  valueType: 'quantity',
  canonicalUnit: UCUM.SCORE.code,
  context: { scope: 'physiological-cycle' }
} as const satisfies MeasurementDefinition;

const CYCLE_AVERAGE_HEART_RATE = {
  key: 'whoop:cycle.average-heart-rate',
  description:
    'Mean heart rate over one WHOOP physiological cycle, which WHOOP starts with a sleep and which does not align with a calendar day. Not one heart rate reading.',
  valueType: 'quantity',
  canonicalUnit: UCUM.PER_MINUTE.code,
  context: { scope: 'physiological-cycle', statistic: 'mean' }
} as const satisfies MeasurementDefinition;

const SLEEP_PERFORMANCE = {
  key: 'whoop:sleep.performance',
  description:
    'WHOOP Sleep Performance for one sleep period: sleep obtained as a percentage of the sleep WHOOP estimates was needed. A WHOOP score.',
  valueType: 'quantity',
  canonicalUnit: UCUM.PERCENT.code,
  context: { scope: 'sleep-period' }
} as const satisfies MeasurementDefinition;

const SLEEP_EFFICIENCY = {
  key: 'whoop:sleep.efficiency',
  description: 'WHOOP sleep efficiency for one sleep period: time asleep as a percentage of time in bed.',
  valueType: 'quantity',
  canonicalUnit: UCUM.PERCENT.code,
  context: { scope: 'sleep-period' }
} as const satisfies MeasurementDefinition;

export const WHOOP_MEASUREMENTS: MeasurementDeclarationSet = {
  schemaVersion: MEASUREMENT_SCHEMA_VERSION,
  connector: CONNECTOR.connector,
  version: 1,
  coverage: 'complete',
  definitions: [
    RECOVERY_SCORE,
    RECOVERY_HRV_RMSSD,
    RECOVERY_RESTING_HEART_RATE,
    RECOVERY_SPO2,
    RECOVERY_SPO2_PERCENTAGE,
    DAY_STRAIN,
    CYCLE_AVERAGE_HEART_RATE,
    SLEEP_PERFORMANCE,
    SLEEP_EFFICIENCY
  ],
  declarations: [
    declareMeasurement(RECOVERY_SCORE, RECOVERY_CODINGS.RECOVERY_SCORE),
    declareMeasurement(RECOVERY_HRV_RMSSD, RECOVERY_CODINGS.HRV_RMSSD),
    declareMeasurement(RECOVERY_RESTING_HEART_RATE, RECOVERY_CODINGS.RESTING_HEART_RATE),
    declareMeasurement(RECOVERY_SPO2, RECOVERY_CODINGS.SPO2),
    declareMeasurement(RECOVERY_SPO2_PERCENTAGE, RECOVERY_CODINGS.SPO2_PERCENTAGE, RECOVERY_CODINGS.SPO2),
    declareMeasurement(DAY_STRAIN, CYCLE_CODINGS.DAY_STRAIN),
    declareMeasurement(CYCLE_AVERAGE_HEART_RATE, CYCLE_CODINGS.AVERAGE_HEART_RATE),
    declareMeasurement(SLEEP_PERFORMANCE, SLEEP_CODINGS.SLEEP_PERFORMANCE),
    declareMeasurement(SLEEP_EFFICIENCY, SLEEP_CODINGS.SLEEP_EFFICIENCY),
    // One sleep period's total_in_bed_time_milli, converted to minutes; naps are skipped by the mapper.
    declareMeasurement('time-in-bed', LOINC_CODINGS.TIME_IN_BED)
  ]
};
