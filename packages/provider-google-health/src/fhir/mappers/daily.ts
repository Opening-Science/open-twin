import type { Observation } from 'fhir/r4';
import type { health_v4 } from 'googleapis';
import {
  CATEGORY,
  compact,
  createObservation,
  dateToIsoString,
  numericComponent,
  SYSTEMS,
  stringComponent,
  toNumber
} from './shared';

export function mapDailyHeartRateVariabilityToFHIR(data: health_v4.Schema$DailyHeartRateVariability): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: {
      system: SYSTEMS.GOOGLE_HEALTH,
      code: 'daily-heart-rate-variability',
      display: 'Daily heart rate variability'
    },
    effectiveDateTime: dateToIsoString(data.date),
    components: compact([
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'average-heart-rate-variability', display: 'Average HRV (RMSSD)' },
        toNumber(data.averageHeartRateVariabilityMilliseconds),
        { unit: 'ms', system: SYSTEMS.UCUM, code: 'ms' }
      ),
      numericComponent(
        {
          system: SYSTEMS.GOOGLE_HEALTH,
          code: 'deep-sleep-rmssd',
          display: 'Deep sleep RMSSD'
        },
        toNumber(data.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds),
        { unit: 'ms', system: SYSTEMS.UCUM, code: 'ms' }
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'entropy', display: 'Heartbeat entropy' },
        toNumber(data.entropy)
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'non-rem-heart-rate', display: 'Non-REM heart rate' },
        toNumber(data.nonRemHeartRateBeatsPerMinute),
        { unit: 'beats/minute', system: SYSTEMS.UCUM, code: '/min' }
      )
    ])
  });
}

export function mapDailyHeartRateZonesToFHIR(data: health_v4.Schema$DailyHeartRateZones): Observation {
  const components = compact(
    (data.heartRateZones ?? []).flatMap((zone) => [
      numericComponent(
        {
          system: SYSTEMS.GOOGLE_HEALTH,
          code: 'heart-rate-zone-min',
          display: `${zone.heartRateZoneType ?? 'zone'} min heart rate`
        },
        toNumber(zone.minBeatsPerMinute),
        { unit: 'beats/minute', system: SYSTEMS.UCUM, code: '/min' }
      ),
      numericComponent(
        {
          system: SYSTEMS.GOOGLE_HEALTH,
          code: 'heart-rate-zone-max',
          display: `${zone.heartRateZoneType ?? 'zone'} max heart rate`
        },
        toNumber(zone.maxBeatsPerMinute),
        { unit: 'beats/minute', system: SYSTEMS.UCUM, code: '/min' }
      )
    ])
  );

  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'daily-heart-rate-zones', display: 'Daily heart rate zones' },
    effectiveDateTime: dateToIsoString(data.date),
    components
  });
}

export function mapDailyOxygenSaturationToFHIR(data: health_v4.Schema$DailyOxygenSaturation): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry' },
    effectiveDateTime: dateToIsoString(data.date),
    valueQuantity:
      data.averagePercentage !== undefined && data.averagePercentage !== null
        ? { value: data.averagePercentage, unit: '%', system: SYSTEMS.UCUM, code: '%' }
        : undefined,
    components: compact([
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'lower-bound-percentage', display: 'Lower bound oxygen saturation' },
        toNumber(data.lowerBoundPercentage),
        { unit: '%', system: SYSTEMS.UCUM, code: '%' }
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'upper-bound-percentage', display: 'Upper bound oxygen saturation' },
        toNumber(data.upperBoundPercentage),
        { unit: '%', system: SYSTEMS.UCUM, code: '%' }
      ),
      numericComponent(
        {
          system: SYSTEMS.GOOGLE_HEALTH,
          code: 'standard-deviation-percentage',
          display: 'Oxygen saturation standard deviation'
        },
        toNumber(data.standardDeviationPercentage),
        { unit: '%', system: SYSTEMS.UCUM, code: '%' }
      )
    ])
  });
}

export function mapDailyRespiratoryRateToFHIR(data: health_v4.Schema$DailyRespiratoryRate): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '9279-1', display: 'Respiratory rate' },
    effectiveDateTime: dateToIsoString(data.date),
    valueQuantity:
      data.breathsPerMinute !== undefined && data.breathsPerMinute !== null
        ? { value: data.breathsPerMinute, unit: 'breaths/minute', system: SYSTEMS.UCUM, code: '/min' }
        : undefined
  });
}

export function mapDailyRestingHeartRateToFHIR(data: health_v4.Schema$DailyRestingHeartRate): Observation {
  const observation = createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '40443-4', display: 'Heart rate --resting' },
    effectiveDateTime: dateToIsoString(data.date),
    valueQuantity:
      toNumber(data.beatsPerMinute) !== undefined
        ? { value: toNumber(data.beatsPerMinute) as number, unit: 'beats/minute', system: SYSTEMS.UCUM, code: '/min' }
        : undefined
  });

  if (data.dailyRestingHeartRateMetadata?.calculationMethod) {
    observation.method = { text: data.dailyRestingHeartRateMetadata.calculationMethod };
  }

  return observation;
}

export function mapDailySleepTemperatureDerivationsToFHIR(
  data: health_v4.Schema$DailySleepTemperatureDerivations
): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: {
      system: SYSTEMS.GOOGLE_HEALTH,
      code: 'daily-sleep-temperature-derivations',
      display: 'Daily sleep temperature derivations'
    },
    effectiveDateTime: dateToIsoString(data.date),
    components: compact([
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'nightly-temperature', display: 'Nightly skin temperature' },
        toNumber(data.nightlyTemperatureCelsius),
        { unit: 'Cel', system: SYSTEMS.UCUM, code: 'Cel' }
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'baseline-temperature', display: 'Baseline skin temperature' },
        toNumber(data.baselineTemperatureCelsius),
        { unit: 'Cel', system: SYSTEMS.UCUM, code: 'Cel' }
      ),
      numericComponent(
        {
          system: SYSTEMS.GOOGLE_HEALTH,
          code: 'relative-nightly-stddev-30d',
          display: 'Relative nightly temperature standard deviation (30d)'
        },
        toNumber(data.relativeNightlyStddev30dCelsius),
        { unit: 'Cel', system: SYSTEMS.UCUM, code: 'Cel' }
      )
    ])
  });
}

export function mapDailyVo2MaxToFHIR(data: health_v4.Schema$DailyVO2Max): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'daily-vo2-max', display: 'Daily VO2 max' },
    effectiveDateTime: dateToIsoString(data.date),
    valueQuantity:
      data.vo2Max !== undefined && data.vo2Max !== null
        ? { value: data.vo2Max, unit: 'mL/kg/min', system: SYSTEMS.UCUM, code: 'mL/kg/min' }
        : undefined,
    components: compact([
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'cardio-fitness-level', display: 'Cardio fitness level' },
        data.cardioFitnessLevel
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'vo2-max-covariance', display: 'VO2 max covariance' },
        toNumber(data.vo2MaxCovariance)
      )
    ])
  });
}
