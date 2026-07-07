import type { Observation } from 'fhir/r4';
import type { health_v4 } from 'googleapis';
import {
  CATEGORY,
  compact,
  createObservation,
  intervalToPeriod,
  numericComponent,
  SYSTEMS,
  stringComponent,
  toNumber
} from './shared';

export function mapActiveEnergyBurnedToFHIR(data: health_v4.Schema$ActiveEnergyBurned): Observation {
  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.LOINC, code: '41981-2', display: 'Calories burned' },
    effectivePeriod: intervalToPeriod(data.interval),
    valueQuantity:
      data.kcal !== undefined && data.kcal !== null
        ? { value: data.kcal, unit: 'kcal', system: SYSTEMS.UCUM, code: 'kcal' }
        : undefined
  });
}

export function mapActiveMinutesToFHIR(data: health_v4.Schema$ActiveMinutes): Observation {
  const components = compact(
    (data.activeMinutesByActivityLevel ?? []).map((level) =>
      numericComponent(
        {
          system: SYSTEMS.GOOGLE_HEALTH,
          code: 'active-minutes',
          display: `Active minutes (${level.activityLevel ?? 'unknown'})`
        },
        toNumber(level.activeMinutes),
        { unit: 'min', system: SYSTEMS.UCUM, code: 'min' }
      )
    )
  );

  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'active-minutes', display: 'Active minutes' },
    effectivePeriod: intervalToPeriod(data.interval),
    components
  });
}

export function mapActiveZoneMinutesToFHIR(data: health_v4.Schema$ActiveZoneMinutes): Observation {
  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'active-zone-minutes', display: 'Active zone minutes' },
    effectivePeriod: intervalToPeriod(data.interval),
    valueQuantity:
      toNumber(data.activeZoneMinutes) !== undefined
        ? { value: toNumber(data.activeZoneMinutes) as number, unit: 'min', system: SYSTEMS.UCUM, code: 'min' }
        : undefined,
    components: compact([
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'heart-rate-zone', display: 'Heart rate zone' },
        data.heartRateZone
      )
    ])
  });
}

export function mapActivityLevelToFHIR(data: health_v4.Schema$ActivityLevel): Observation {
  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'activity-level', display: 'Activity level' },
    effectivePeriod: intervalToPeriod(data.interval),
    components: compact([
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'activity-level-type', display: 'Activity level type' },
        data.activityLevelType
      )
    ])
  });
}

export function mapAltitudeToFHIR(data: health_v4.Schema$Altitude): Observation {
  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'altitude', display: 'Altitude gain' },
    effectivePeriod: intervalToPeriod(data.interval),
    valueQuantity:
      toNumber(data.gainMillimeters) !== undefined
        ? { value: toNumber(data.gainMillimeters) as number, unit: 'mm', system: SYSTEMS.UCUM, code: 'mm' }
        : undefined
  });
}

export function mapDistanceToFHIR(data: health_v4.Schema$Distance): Observation {
  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'distance', display: 'Distance' },
    effectivePeriod: intervalToPeriod(data.interval),
    valueQuantity:
      toNumber(data.millimeters) !== undefined
        ? { value: toNumber(data.millimeters) as number, unit: 'mm', system: SYSTEMS.UCUM, code: 'mm' }
        : undefined
  });
}

export function mapFloorsToFHIR(data: health_v4.Schema$Floors): Observation {
  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'floors', display: 'Floors climbed' },
    effectivePeriod: intervalToPeriod(data.interval),
    valueQuantity:
      toNumber(data.count) !== undefined ? { value: toNumber(data.count) as number, unit: 'floors' } : undefined
  });
}

export function mapSedentaryPeriodToFHIR(data: health_v4.Schema$SedentaryPeriod): Observation {
  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'sedentary-period', display: 'Sedentary period' },
    effectivePeriod: intervalToPeriod(data.interval)
  });
}

export function mapStepsToFHIR(data: health_v4.Schema$Steps): Observation {
  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.LOINC, code: '55423-8', display: 'Number of steps in unspecified time Pedometer' },
    effectivePeriod: intervalToPeriod(data.interval),
    valueQuantity:
      toNumber(data.count) !== undefined ? { value: toNumber(data.count) as number, unit: 'steps' } : undefined
  });
}

export function mapSwimLengthsDataToFHIR(data: health_v4.Schema$SwimLengthsData): Observation {
  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'swim-lengths-data', display: 'Swim lengths data' },
    effectivePeriod: intervalToPeriod(data.interval),
    valueQuantity:
      toNumber(data.strokeCount) !== undefined
        ? { value: toNumber(data.strokeCount) as number, unit: 'strokes' }
        : undefined,
    components: compact([
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'swim-stroke-type', display: 'Swim stroke type' },
        data.swimStrokeType
      )
    ])
  });
}

export function mapTimeInHeartRateZoneToFHIR(data: health_v4.Schema$TimeInHeartRateZone): Observation {
  return createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'time-in-heart-rate-zone', display: 'Time in heart rate zone' },
    effectivePeriod: intervalToPeriod(data.interval),
    components: compact([
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'heart-rate-zone-type', display: 'Heart rate zone type' },
        data.heartRateZoneType
      )
    ])
  });
}
