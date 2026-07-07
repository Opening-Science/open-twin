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

export function mapElectrocardiogramToFHIR(data: health_v4.Schema$Electrocardiogram): Observation {
  const observation = createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: { system: SYSTEMS.LOINC, code: '11524-6', display: 'EKG study' },
    effectivePeriod: intervalToPeriod(data.interval),
    components: compact([
      numericComponent(
        { system: SYSTEMS.LOINC, code: '8867-4', display: 'Heart rate' },
        toNumber(data.beatsPerMinuteAvg),
        { unit: 'beats/minute', system: SYSTEMS.UCUM, code: '/min' }
      ),
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'result-classification', display: 'ECG result classification' },
        data.resultClassification
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'sampling-frequency-hertz', display: 'Sampling frequency' },
        toNumber(data.samplingFrequencyHertz),
        { unit: 'Hz', system: SYSTEMS.UCUM, code: 'Hz' }
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'lead-number', display: 'Number of leads' },
        toNumber(data.leadNumber)
      )
    ])
  });

  if (data.medicalDeviceInfo?.deviceModel) {
    observation.device = { display: data.medicalDeviceInfo.deviceModel };
  }

  return observation;
}

export function mapExerciseToFHIR(data: health_v4.Schema$Exercise): Observation {
  const summary = data.metricsSummary;
  const observation = createObservation({
    category: CATEGORY.ACTIVITY,
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'exercise', display: data.displayName ?? 'Exercise' },
    effectivePeriod: intervalToPeriod(data.interval),
    components: compact([
      stringComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'exercise-type', display: 'Exercise type' },
        data.exerciseType
      ),
      numericComponent(
        { system: SYSTEMS.LOINC, code: '41981-2', display: 'Calories burned' },
        summary?.caloriesKcal ?? undefined,
        { unit: 'kcal', system: SYSTEMS.UCUM, code: 'kcal' }
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'distance', display: 'Distance' },
        summary?.distanceMillimeters ?? undefined,
        { unit: 'mm', system: SYSTEMS.UCUM, code: 'mm' }
      ),
      numericComponent({ system: SYSTEMS.GOOGLE_HEALTH, code: 'steps', display: 'Steps' }, toNumber(summary?.steps), {
        unit: 'steps'
      }),
      numericComponent(
        { system: SYSTEMS.LOINC, code: '8867-4', display: 'Heart rate' },
        toNumber(summary?.averageHeartRateBeatsPerMinute),
        { unit: 'beats/minute', system: SYSTEMS.UCUM, code: '/min' }
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'elevation-gain', display: 'Elevation gain' },
        summary?.elevationGainMillimeters ?? undefined,
        { unit: 'mm', system: SYSTEMS.UCUM, code: 'mm' }
      )
    ])
  });

  if (data.notes) {
    observation.note = [{ text: data.notes }];
  }

  return observation;
}

export function mapHydrationLogToFHIR(data: health_v4.Schema$HydrationLog): Observation {
  return createObservation({
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'hydration-log', display: 'Hydration log' },
    effectivePeriod: intervalToPeriod(data.interval),
    valueQuantity:
      data.amountConsumed?.milliliters !== undefined && data.amountConsumed?.milliliters !== null
        ? { value: data.amountConsumed.milliliters, unit: 'mL', system: SYSTEMS.UCUM, code: 'mL' }
        : undefined
  });
}

export function mapIrregularRhythmNotificationToFHIR(data: health_v4.Schema$IrregularRhythmNotification): Observation {
  const observation = createObservation({
    category: CATEGORY.VITAL_SIGNS,
    code: {
      system: SYSTEMS.GOOGLE_HEALTH,
      code: 'irregular-rhythm-notification',
      display: 'Irregular rhythm notification'
    },
    effectivePeriod: intervalToPeriod(data.interval),
    components: compact([
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'alert-window-count', display: 'Alert window count' },
        data.alertWindows?.length
      )
    ])
  });

  if (data.medicalDeviceInfo?.deviceModel) {
    observation.device = { display: data.medicalDeviceInfo.deviceModel };
  }

  return observation;
}

export function mapNutritionLogToFHIR(data: health_v4.Schema$NutritionLog): Observation {
  return createObservation({
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'nutrition-log', display: data.foodDisplayName ?? 'Nutrition log' },
    effectivePeriod: intervalToPeriod(data.interval),
    components: compact([
      stringComponent({ system: SYSTEMS.GOOGLE_HEALTH, code: 'meal-type', display: 'Meal type' }, data.mealType),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'energy', display: 'Energy intake' },
        data.energy?.kcal ?? undefined,
        { unit: 'kcal', system: SYSTEMS.UCUM, code: 'kcal' }
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'total-carbohydrate', display: 'Total carbohydrate' },
        data.totalCarbohydrate?.grams ?? undefined,
        { unit: 'g', system: SYSTEMS.UCUM, code: 'g' }
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'total-fat', display: 'Total fat' },
        data.totalFat?.grams ?? undefined,
        { unit: 'g', system: SYSTEMS.UCUM, code: 'g' }
      )
    ])
  });
}

export function mapSleepToFHIR(data: health_v4.Schema$Sleep): Observation {
  const summary = data.summary;
  const observation = createObservation({
    code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'sleep', display: 'Sleep session' },
    effectivePeriod: intervalToPeriod(data.interval),
    components: compact([
      numericComponent(
        { system: SYSTEMS.LOINC, code: '93832-4', display: 'Sleep duration' },
        toNumber(summary?.minutesAsleep),
        { unit: 'min', system: SYSTEMS.UCUM, code: 'min' }
      ),
      numericComponent(
        { system: SYSTEMS.GOOGLE_HEALTH, code: 'minutes-awake', display: 'Minutes awake' },
        toNumber(summary?.minutesAwake),
        { unit: 'min', system: SYSTEMS.UCUM, code: 'min' }
      ),
      numericComponent(
        { system: SYSTEMS.LOINC, code: '103213-5', display: 'Time in bed' },
        toNumber(summary?.minutesInSleepPeriod),
        { unit: 'min', system: SYSTEMS.UCUM, code: 'min' }
      ),
      numericComponent(
        { system: SYSTEMS.LOINC, code: '103212-7', display: 'Sleep latency' },
        toNumber(summary?.minutesToFallAsleep),
        { unit: 'min', system: SYSTEMS.UCUM, code: 'min' }
      ),
      stringComponent({ system: SYSTEMS.GOOGLE_HEALTH, code: 'sleep-type', display: 'Sleep type' }, data.type)
    ])
  });

  if (data.metadata?.externalId) {
    observation.identifier = [{ system: SYSTEMS.GOOGLE_HEALTH, value: data.metadata.externalId }];
  }

  return observation;
}
