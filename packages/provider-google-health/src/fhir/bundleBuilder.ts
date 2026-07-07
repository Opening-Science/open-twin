import type { Bundle, Observation } from 'fhir/r4';
import type { health_v4 } from 'googleapis';
import {
  mapDailyHeartRateVariabilityToFHIR,
  mapDailyHeartRateZonesToFHIR,
  mapDailyOxygenSaturationToFHIR,
  mapDailyRespiratoryRateToFHIR,
  mapDailyRestingHeartRateToFHIR,
  mapDailySleepTemperatureDerivationsToFHIR,
  mapDailyVo2MaxToFHIR
} from './mappers/daily';
import {
  mapActiveEnergyBurnedToFHIR,
  mapActiveMinutesToFHIR,
  mapActiveZoneMinutesToFHIR,
  mapActivityLevelToFHIR,
  mapAltitudeToFHIR,
  mapDistanceToFHIR,
  mapFloorsToFHIR,
  mapSedentaryPeriodToFHIR,
  mapStepsToFHIR,
  mapSwimLengthsDataToFHIR,
  mapTimeInHeartRateZoneToFHIR
} from './mappers/interval';
import {
  mapBloodGlucoseToFHIR,
  mapBodyFatToFHIR,
  mapCoreBodyTemperatureToFHIR,
  mapHeartRateToFHIR,
  mapHeartRateVariabilityToFHIR,
  mapHeightToFHIR,
  mapOxygenSaturationToFHIR,
  mapRespiratoryRateSleepSummaryToFHIR,
  mapRunVo2MaxToFHIR,
  mapVo2MaxToFHIR,
  mapWeightToFHIR
} from './mappers/sample';
import {
  mapElectrocardiogramToFHIR,
  mapExerciseToFHIR,
  mapHydrationLogToFHIR,
  mapIrregularRhythmNotificationToFHIR,
  mapNutritionLogToFHIR,
  mapSleepToFHIR
} from './mappers/session';

export function mapDataPointToFHIR(dataPoint: health_v4.Schema$DataPoint): Observation | undefined {
  if (dataPoint.dailyHeartRateVariability) {
    return mapDailyHeartRateVariabilityToFHIR(dataPoint.dailyHeartRateVariability);
  }
  if (dataPoint.dailyHeartRateZones) {
    return mapDailyHeartRateZonesToFHIR(dataPoint.dailyHeartRateZones);
  }
  if (dataPoint.dailyOxygenSaturation) {
    return mapDailyOxygenSaturationToFHIR(dataPoint.dailyOxygenSaturation);
  }
  if (dataPoint.dailyRespiratoryRate) {
    return mapDailyRespiratoryRateToFHIR(dataPoint.dailyRespiratoryRate);
  }
  if (dataPoint.dailyRestingHeartRate) {
    return mapDailyRestingHeartRateToFHIR(dataPoint.dailyRestingHeartRate);
  }
  if (dataPoint.dailySleepTemperatureDerivations) {
    return mapDailySleepTemperatureDerivationsToFHIR(dataPoint.dailySleepTemperatureDerivations);
  }
  if (dataPoint.dailyVo2Max) {
    return mapDailyVo2MaxToFHIR(dataPoint.dailyVo2Max);
  }

  if (dataPoint.bloodGlucose) {
    return mapBloodGlucoseToFHIR(dataPoint.bloodGlucose);
  }
  if (dataPoint.bodyFat) {
    return mapBodyFatToFHIR(dataPoint.bodyFat);
  }
  if (dataPoint.coreBodyTemperature) {
    return mapCoreBodyTemperatureToFHIR(dataPoint.coreBodyTemperature);
  }
  if (dataPoint.heartRate) {
    return mapHeartRateToFHIR(dataPoint.heartRate);
  }
  if (dataPoint.heartRateVariability) {
    return mapHeartRateVariabilityToFHIR(dataPoint.heartRateVariability);
  }
  if (dataPoint.height) {
    return mapHeightToFHIR(dataPoint.height);
  }
  if (dataPoint.oxygenSaturation) {
    return mapOxygenSaturationToFHIR(dataPoint.oxygenSaturation);
  }
  if (dataPoint.respiratoryRateSleepSummary) {
    return mapRespiratoryRateSleepSummaryToFHIR(dataPoint.respiratoryRateSleepSummary);
  }
  if (dataPoint.runVo2Max) {
    return mapRunVo2MaxToFHIR(dataPoint.runVo2Max);
  }
  if (dataPoint.vo2Max) {
    return mapVo2MaxToFHIR(dataPoint.vo2Max);
  }
  if (dataPoint.weight) {
    return mapWeightToFHIR(dataPoint.weight);
  }

  if (dataPoint.activeEnergyBurned) {
    return mapActiveEnergyBurnedToFHIR(dataPoint.activeEnergyBurned);
  }
  if (dataPoint.activeMinutes) {
    return mapActiveMinutesToFHIR(dataPoint.activeMinutes);
  }
  if (dataPoint.activeZoneMinutes) {
    return mapActiveZoneMinutesToFHIR(dataPoint.activeZoneMinutes);
  }
  if (dataPoint.activityLevel) {
    return mapActivityLevelToFHIR(dataPoint.activityLevel);
  }
  if (dataPoint.altitude) {
    return mapAltitudeToFHIR(dataPoint.altitude);
  }
  if (dataPoint.distance) {
    return mapDistanceToFHIR(dataPoint.distance);
  }
  if (dataPoint.floors) {
    return mapFloorsToFHIR(dataPoint.floors);
  }
  if (dataPoint.sedentaryPeriod) {
    return mapSedentaryPeriodToFHIR(dataPoint.sedentaryPeriod);
  }
  if (dataPoint.steps) {
    return mapStepsToFHIR(dataPoint.steps);
  }
  if (dataPoint.swimLengthsData) {
    return mapSwimLengthsDataToFHIR(dataPoint.swimLengthsData);
  }
  if (dataPoint.timeInHeartRateZone) {
    return mapTimeInHeartRateZoneToFHIR(dataPoint.timeInHeartRateZone);
  }

  if (dataPoint.electrocardiogram) {
    return mapElectrocardiogramToFHIR(dataPoint.electrocardiogram);
  }
  if (dataPoint.exercise) {
    return mapExerciseToFHIR(dataPoint.exercise);
  }
  if (dataPoint.hydrationLog) {
    return mapHydrationLogToFHIR(dataPoint.hydrationLog);
  }
  if (dataPoint.irregularRhythmNotification) {
    return mapIrregularRhythmNotificationToFHIR(dataPoint.irregularRhythmNotification);
  }
  if (dataPoint.nutritionLog) {
    return mapNutritionLogToFHIR(dataPoint.nutritionLog);
  }
  if (dataPoint.sleep) {
    return mapSleepToFHIR(dataPoint.sleep);
  }

  return undefined;
}

export function buildBundleFromResponses(responses: health_v4.Schema$ListDataPointsResponse[]): Bundle {
  const observations: Observation[] = [];

  for (const response of responses) {
    for (const dataPoint of response.dataPoints ?? []) {
      const observation = mapDataPointToFHIR(dataPoint);
      if (observation) {
        observations.push(observation);
      }
    }
  }

  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: observations.map((observation) => ({ resource: observation }))
  };
}
