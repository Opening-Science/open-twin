/**
 * WHAT: Synthetic `dataPoints.list` responses that drive every mapper through every optional field, for the measurement-declaration audit.
 * NOT:  Not a recorded response and not personal data; it proves declarations against mapper output, never that the mappers are right.
 * GOVERNED BY: DECISIONS.md#d18
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Shapes follow the Google Health API v4 discovery document: int64 fields arrive as JSON strings, lengths in millimetres, mass in grams. Records marked "coverage" carry an UNSPECIFIED or omitted enum the API can send but a real sync rarely does; they exist so the declarations for those codes are exercised.
 */
import type { health_v4 } from 'googleapis';

const DATE = { year: 2026, month: 7, day: 7 };
const SAMPLE_TIME = { physicalTime: '2026-07-07T05:40:29.354Z', utcOffset: '7200s' };
const INTERVAL = {
  startTime: '2026-07-07T07:00:00Z',
  startUtcOffset: '7200s',
  endTime: '2026-07-07T07:15:00Z',
  endUtcOffset: '7200s'
};
const NIGHT = {
  startTime: '2026-07-06T22:30:00Z',
  startUtcOffset: '7200s',
  endTime: '2026-07-07T06:30:00Z',
  endUtcOffset: '7200s'
};
const DEVICE = { recordingMethod: 'AUTO_DETECTED', platform: 'FITBIT', device: { displayName: 'Pixel Watch 3' } };

function point(dataPoint: health_v4.Schema$DataPoint): health_v4.Schema$DataPoint {
  return { dataSource: DEVICE, ...dataPoint };
}

const DAILY: health_v4.Schema$DataPoint[] = [
  point({
    dailyHeartRateVariability: {
      date: DATE,
      averageHeartRateVariabilityMilliseconds: 38.4,
      deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 44.1,
      entropy: 2.7,
      nonRemHeartRateBeatsPerMinute: '54'
    }
  }),
  point({
    dailyHeartRateZones: {
      date: DATE,
      heartRateZones: [
        { heartRateZoneType: 'LIGHT', minBeatsPerMinute: '98', maxBeatsPerMinute: '117' },
        { heartRateZoneType: 'MODERATE', minBeatsPerMinute: '117', maxBeatsPerMinute: '136' },
        { heartRateZoneType: 'VIGOROUS', minBeatsPerMinute: '136', maxBeatsPerMinute: '161' },
        { heartRateZoneType: 'PEAK', minBeatsPerMinute: '161', maxBeatsPerMinute: '190' }
      ]
    }
  }),
  // Coverage: an UNSPECIFIED zone and one whose type is omitted (the mapper codes it `unknown`).
  point({
    dailyHeartRateZones: {
      date: { year: 2026, month: 7, day: 8 },
      heartRateZones: [
        { heartRateZoneType: 'HEART_RATE_ZONE_TYPE_UNSPECIFIED', minBeatsPerMinute: '90', maxBeatsPerMinute: '98' },
        { minBeatsPerMinute: '80', maxBeatsPerMinute: '90' }
      ]
    }
  }),
  point({
    dailyOxygenSaturation: {
      date: DATE,
      averagePercentage: 95.8,
      lowerBoundPercentage: 93.1,
      upperBoundPercentage: 98.2,
      standardDeviationPercentage: 0.9
    }
  }),
  point({ dailyRespiratoryRate: { date: DATE, breathsPerMinute: 14.6 } }),
  point({
    dailyRestingHeartRate: {
      date: DATE,
      beatsPerMinute: '57',
      dailyRestingHeartRateMetadata: { calculationMethod: 'WITH_SLEEP' }
    }
  }),
  point({
    dailySleepTemperatureDerivations: {
      date: DATE,
      nightlyTemperatureCelsius: 33.9,
      baselineTemperatureCelsius: 33.6,
      relativeNightlyStddev30dCelsius: 0.4
    }
  }),
  point({
    dailyVo2Max: { date: DATE, vo2Max: 46.2, estimated: true, cardioFitnessLevel: 'GOOD', vo2MaxCovariance: 1.8 }
  })
];

const SAMPLE: health_v4.Schema$DataPoint[] = [
  point({
    bloodGlucose: {
      sampleTime: SAMPLE_TIME,
      bloodGlucoseMilligramsPerDeciliter: 96,
      mealType: 'BREAKFAST',
      measurementTiming: 'BEFORE_MEAL',
      specimen: 'CAPILLARY_BLOOD',
      notes: 'synthetic'
    }
  }),
  point({ bodyFat: { sampleTime: SAMPLE_TIME, percentage: 18.4 } }),
  point({
    coreBodyTemperature: {
      sampleTime: SAMPLE_TIME,
      temperatureCelsius: 36.8,
      measurementLocation: 'EAR',
      id: 'core-body-temperature-1'
    }
  }),
  point({
    heartRate: {
      sampleTime: SAMPLE_TIME,
      beatsPerMinute: '73',
      metadata: { motionContext: 'SEDENTARY', sensorLocation: 'WRIST' }
    }
  }),
  point({
    heartRateVariability: {
      sampleTime: SAMPLE_TIME,
      rootMeanSquareOfSuccessiveDifferencesMilliseconds: 41.2,
      standardDeviationMilliseconds: 52.7
    }
  }),
  point({ height: { sampleTime: SAMPLE_TIME, heightMillimeters: '1750' } }),
  point({ oxygenSaturation: { sampleTime: SAMPLE_TIME, percentage: 97 } }),
  point({
    respiratoryRateSleepSummary: {
      sampleTime: SAMPLE_TIME,
      fullSleepStats: { breathsPerMinute: 14.2 },
      deepSleepStats: { breathsPerMinute: 13.1 },
      lightSleepStats: { breathsPerMinute: 14.4 },
      remSleepStats: { breathsPerMinute: 15.3 }
    }
  }),
  point({ runVo2Max: { sampleTime: SAMPLE_TIME, runVo2Max: 47.5 } }),
  point({ vo2Max: { sampleTime: SAMPLE_TIME, vo2Max: 45.9, measurementMethod: 'GOOGLE_DEMOGRAPHIC' } }),
  point({
    name: 'users/0000000000000000000/dataTypes/weight/dataPoints/1',
    weight: { sampleTime: SAMPLE_TIME, weightGrams: 72400, notes: 'synthetic' }
  })
];

const INTERVALS: health_v4.Schema$DataPoint[] = [
  point({ activeEnergyBurned: { interval: INTERVAL, kcal: 61.5 } }),
  point({ basalEnergyBurned: { interval: INTERVAL, kcal: 18.2 } }),
  point({
    activeMinutes: {
      interval: INTERVAL,
      activeMinutesByActivityLevel: [
        { activityLevel: 'LIGHT', activeMinutes: '6' },
        { activityLevel: 'MODERATE', activeMinutes: '5' },
        { activityLevel: 'VIGOROUS', activeMinutes: '4' }
      ]
    }
  }),
  // Coverage: an UNSPECIFIED level and one whose level is omitted (the mapper codes it `unknown`).
  point({
    activeMinutes: {
      interval: { ...INTERVAL, startTime: '2026-07-07T08:00:00Z', endTime: '2026-07-07T08:15:00Z' },
      activeMinutesByActivityLevel: [
        { activityLevel: 'ACTIVITY_LEVEL_UNSPECIFIED', activeMinutes: '2' },
        { activeMinutes: '1' }
      ]
    }
  }),
  point({ activeZoneMinutes: { interval: INTERVAL, activeZoneMinutes: '8', heartRateZone: 'CARDIO' } }),
  point({ activityLevel: { interval: INTERVAL, activityLevelType: 'MODERATELY_ACTIVE' } }),
  point({ altitude: { interval: INTERVAL, gainMillimeters: '3048' } }),
  point({ distance: { interval: INTERVAL, millimeters: '1842000' } }),
  point({ floors: { interval: INTERVAL, count: '3' } }),
  point({ sedentaryPeriod: { interval: INTERVAL } }),
  point({ steps: { interval: INTERVAL, count: '1630' } }),
  point({ swimLengthsData: { interval: INTERVAL, strokeCount: '24', swimStrokeType: 'FREESTYLE' } }),
  point({ timeInHeartRateZone: { interval: INTERVAL, heartRateZoneType: 'VIGOROUS' } })
];

const SESSIONS: health_v4.Schema$DataPoint[] = [
  point({
    electrocardiogram: {
      interval: { ...INTERVAL, endTime: '2026-07-07T07:00:30Z' },
      beatsPerMinuteAvg: '68',
      resultClassification: 'NORMAL_SINUS_RHYTHM',
      samplingFrequencyHertz: 250,
      leadNumber: 1,
      medicalDeviceInfo: { deviceModel: 'Pixel Watch 3' }
    }
  }),
  point({
    exercise: {
      interval: INTERVAL,
      displayName: 'Morning run',
      exerciseType: 'RUNNING',
      notes: 'synthetic',
      metricsSummary: {
        caloriesKcal: 182,
        distanceMillimeters: 2510000,
        steps: '2380',
        averageHeartRateBeatsPerMinute: '148',
        elevationGainMillimeters: 12000,
        activeZoneMinutes: '22'
      }
    }
  }),
  point({ hydrationLog: { interval: INTERVAL, amountConsumed: { milliliters: 330 } } }),
  point({
    irregularRhythmNotification: {
      interval: NIGHT,
      alertWindows: [
        { startTime: '2026-07-07T01:00:00Z', endTime: '2026-07-07T01:30:00Z' },
        { startTime: '2026-07-07T01:20:00Z', endTime: '2026-07-07T01:50:00Z' }
      ],
      medicalDeviceInfo: { deviceModel: 'Pixel Watch 3' }
    }
  }),
  point({
    nutritionLog: {
      interval: INTERVAL,
      foodDisplayName: 'Oatmeal',
      mealType: 'BREAKFAST',
      energy: { kcal: 310 },
      energyFromFat: { kcal: 54 },
      totalCarbohydrate: { grams: 54 },
      totalFat: { grams: 6 }
    }
  }),
  point({
    sleep: {
      interval: NIGHT,
      type: 'STAGES',
      metadata: { externalId: 'sleep-stages-1' },
      stages: [
        { type: 'LIGHT', startTime: '2026-07-06T22:30:00Z', endTime: '2026-07-06T23:10:00Z' },
        { type: 'DEEP', startTime: '2026-07-06T23:10:00Z', endTime: '2026-07-07T00:00:00Z' }
      ],
      outOfBedSegments: [{ startTime: '2026-07-07T02:00:00Z', endTime: '2026-07-07T02:06:00Z' }],
      summary: {
        minutesAsleep: '432',
        minutesAwake: '48',
        minutesAfterWakeUp: '3',
        minutesInSleepPeriod: '480',
        minutesToFallAsleep: '11',
        stagesSummary: [
          { type: 'AWAKE', minutes: '48', count: '9' },
          { type: 'LIGHT', minutes: '231', count: '22' },
          { type: 'DEEP', minutes: '92', count: '6' },
          { type: 'REM', minutes: '109', count: '5' }
        ]
      }
    }
  }),
  point({
    sleep: {
      interval: { ...NIGHT, startTime: '2026-07-07T13:00:00Z', endTime: '2026-07-07T13:50:00Z' },
      type: 'CLASSIC',
      summary: {
        minutesAsleep: '41',
        minutesAwake: '4',
        stagesSummary: [
          { type: 'ASLEEP', minutes: '41', count: '1' },
          { type: 'RESTLESS', minutes: '5', count: '2' },
          { type: 'AWAKE', minutes: '4', count: '1' }
        ]
      }
    }
  }),
  // Coverage: an UNSPECIFIED stage in the summary.
  point({
    sleep: {
      interval: { ...NIGHT, startTime: '2026-07-07T16:00:00Z', endTime: '2026-07-07T16:20:00Z' },
      summary: { stagesSummary: [{ type: 'SLEEP_STAGE_TYPE_UNSPECIFIED', minutes: '20', count: '1' }] }
    }
  })
];

/** One response per record category; together they reach every mapper the bundle builder dispatches to. */
export function measurementResponses(): health_v4.Schema$ListDataPointsResponse[] {
  return [{ dataPoints: DAILY }, { dataPoints: SAMPLE }, { dataPoints: INTERVALS }, { dataPoints: SESSIONS }];
}
