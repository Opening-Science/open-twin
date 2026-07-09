import type { Observation } from 'fhir/r4';
import type { health_v4 } from 'googleapis';
import {
  CATEGORY,
  compact,
  createObservation,
  numericComponent,
  SYSTEMS,
  sampleTimeToDateTime,
  stringComponent,
  toNumber
} from './shared';

export function mapBloodGlucoseToFHIR(data: health_v4.Schema$BloodGlucose): Observation {
  const observation = createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '2339-0', display: 'Glucose [Mass/volume] in Blood' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      data.bloodGlucoseMilligramsPerDeciliter !== undefined && data.bloodGlucoseMilligramsPerDeciliter !== null
        ? { value: data.bloodGlucoseMilligramsPerDeciliter, unit: 'mg/dL', system: SYSTEMS.UCUM, code: 'mg/dL' }
        : undefined,
    components: compact([
      stringComponent({ system: SYSTEMS.GOOGLE_HEALTH, code: 'meal-type', display: 'Meal type' }, data.mealType),
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'measurement-timing', display: 'Measurement timing' },
        data.measurementTiming
      ),
      stringComponent({ system: SYSTEMS.GOOGLE_HEALTH, code: 'specimen', display: 'Specimen source' }, data.specimen)
    ])
  });

  if (data.notes) {
    observation.note = [{ text: data.notes }];
  }

  return observation;
}

export function mapBodyFatToFHIR(data: health_v4.Schema$BodyFat): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '41982-0', display: 'Percentage of body fat Measured' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      data.percentage !== undefined && data.percentage !== null
        ? { value: data.percentage, unit: '%', system: SYSTEMS.UCUM, code: '%' }
        : undefined
  });
}

export function mapCoreBodyTemperatureToFHIR(data: health_v4.Schema$CoreBodyTemperature): Observation {
  const observation = createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '8310-5', display: 'Body temperature' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      data.temperatureCelsius !== undefined && data.temperatureCelsius !== null
        ? { value: data.temperatureCelsius, unit: 'Cel', system: SYSTEMS.UCUM, code: 'Cel' }
        : undefined,
    components: compact([
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'measurement-location', display: 'Measurement location' },
        data.measurementLocation
      )
    ])
  });

  if (data.id) {
    observation.identifier = [{ system: SYSTEMS.GOOGLE_HEALTH, value: data.id }];
  }

  return observation;
}

export function mapHeartRateToFHIR(data: health_v4.Schema$HeartRate): Observation {
  const observation = createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '8867-4', display: 'Heart rate' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      toNumber(data.beatsPerMinute) !== undefined
        ? { value: toNumber(data.beatsPerMinute) as number, unit: 'beats/minute', system: SYSTEMS.UCUM, code: '/min' }
        : undefined,
    components: compact([
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'motion-context', display: 'Motion context' },
        data.metadata?.motionContext
      ),
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'sensor-location', display: 'Sensor location' },
        data.metadata?.sensorLocation
      )
    ])
  });

  return observation;
}

export function mapHeartRateVariabilityToFHIR(data: health_v4.Schema$HeartRateVariability): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'heart-rate-variability', display: 'Heart rate variability' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      data.rootMeanSquareOfSuccessiveDifferencesMilliseconds !== undefined &&
      data.rootMeanSquareOfSuccessiveDifferencesMilliseconds !== null
        ? {
            value: data.rootMeanSquareOfSuccessiveDifferencesMilliseconds,
            unit: 'ms',
            system: SYSTEMS.UCUM,
            code: 'ms'
          }
        : undefined,
    components: compact([
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'standard-deviation', display: 'HRV standard deviation (SDNN)' },
        toNumber(data.standardDeviationMilliseconds),
        { unit: 'ms', system: SYSTEMS.UCUM, code: 'ms' }
      )
    ])
  });
}

export function mapHeightToFHIR(data: health_v4.Schema$Height): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '8302-2', display: 'Body height' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      toNumber(data.heightMillimeters) !== undefined
        ? { value: toNumber(data.heightMillimeters) as number, unit: 'mm', system: SYSTEMS.UCUM, code: 'mm' }
        : undefined
  });
}

export function mapOxygenSaturationToFHIR(data: health_v4.Schema$OxygenSaturation): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      data.percentage !== undefined && data.percentage !== null
        ? { value: data.percentage, unit: '%', system: SYSTEMS.UCUM, code: '%' }
        : undefined
  });
}

export function mapRespiratoryRateSleepSummaryToFHIR(data: health_v4.Schema$RespiratoryRateSleepSummary): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '9279-1', display: 'Respiratory rate' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      data.fullSleepStats?.breathsPerMinute !== undefined && data.fullSleepStats?.breathsPerMinute !== null
        ? { value: data.fullSleepStats.breathsPerMinute, unit: 'breaths/minute', system: SYSTEMS.UCUM, code: '/min' }
        : undefined,
    components: compact([
      numericComponent(
        {
          system: SYSTEMS.GOOGLE_HEALTH,
          code: 'deep-sleep-breaths-per-minute',
          display: 'Deep sleep respiratory rate'
        },
        toNumber(data.deepSleepStats?.breathsPerMinute),
        { unit: 'breaths/minute', system: SYSTEMS.UCUM, code: '/min' }
      ),
      numericComponent(
        {
          system: SYSTEMS.GOOGLE_HEALTH,
          code: 'light-sleep-breaths-per-minute',
          display: 'Light sleep respiratory rate'
        },
        toNumber(data.lightSleepStats?.breathsPerMinute),
        { unit: 'breaths/minute', system: SYSTEMS.UCUM, code: '/min' }
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'rem-sleep-breaths-per-minute', display: 'REM sleep respiratory rate' },
        toNumber(data.remSleepStats?.breathsPerMinute),
        { unit: 'breaths/minute', system: SYSTEMS.UCUM, code: '/min' }
      )
    ])
  });
}

export function mapRunVo2MaxToFHIR(data: health_v4.Schema$RunVO2Max): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '94122-9', display: 'Running VO2 max' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      data.runVo2Max !== undefined && data.runVo2Max !== null
        ? { value: data.runVo2Max, unit: 'mL/kg/min', system: SYSTEMS.UCUM, code: 'mL/kg/min' }
        : undefined
  });
}

export function mapVo2MaxToFHIR(data: health_v4.Schema$VO2Max): Observation {
  return createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '94122-9', display: 'VO2 max' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      data.vo2Max !== undefined && data.vo2Max !== null
        ? { value: data.vo2Max, unit: 'mL/kg/min', system: SYSTEMS.UCUM, code: 'mL/kg/min' }
        : undefined,
    components: compact([
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'measurement-method', display: 'Measurement method' },
        data.measurementMethod
      )
    ])
  });
}

export function mapWeightToFHIR(data: health_v4.Schema$Weight): Observation {
  const observation = createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '29463-7', display: 'Body weight' },
    effectiveDateTime: sampleTimeToDateTime(data.sampleTime),
    valueQuantity:
      data.weightGrams !== undefined && data.weightGrams !== null
        ? { value: data.weightGrams, unit: 'g', system: SYSTEMS.UCUM, code: 'g' }
        : undefined
  });

  if (data.notes) {
    observation.note = [{ text: data.notes }];
  }

  return observation;
}
