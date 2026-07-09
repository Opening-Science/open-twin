import type { health_v4 } from 'googleapis';
import { describe, expect, it } from 'vitest';
import {
  mapDailyHeartRateVariabilityToFHIR,
  mapDailyHeartRateZonesToFHIR,
  mapDailyOxygenSaturationToFHIR,
  mapDailyRespiratoryRateToFHIR,
  mapDailyRestingHeartRateToFHIR,
  mapDailySleepTemperatureDerivationsToFHIR,
  mapDailyVo2MaxToFHIR
} from '../../fhir/mappers/daily';

const GOOGLE_HEALTH = 'https://developers.google.com/health/data-types';
const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';

describe('mapDailyHeartRateVariabilityToFHIR', () => {
  const base: health_v4.Schema$DailyHeartRateVariability = {
    date: { year: 2026, month: 6, day: 20 },
    averageHeartRateVariabilityMilliseconds: 45,
    deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 60,
    entropy: 2.5,
    nonRemHeartRateBeatsPerMinute: '55'
  };

  it('maps to a vital-signs Observation with the Google Health code', () => {
    const observation = mapDailyHeartRateVariabilityToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [
          { system: GOOGLE_HEALTH, code: 'daily-heart-rate-variability', display: 'Daily heart rate variability' }
        ]
      }
    });
  });

  it('formats the date into a padded ISO effectiveDateTime', () => {
    const observation = mapDailyHeartRateVariabilityToFHIR({ ...base, date: { year: 2026, month: 1, day: 5 } });

    expect(observation.effectiveDateTime).toBe('2026-01-05');
  });
});

describe('mapDailyHeartRateZonesToFHIR', () => {
  const base: health_v4.Schema$DailyHeartRateZones = {
    date: { year: 2026, month: 6, day: 20 },
    heartRateZones: [
      {
        heartRateZoneType: 'fat-burn',
        minBeatsPerMinute: '100',
        maxBeatsPerMinute: '140'
      },
      {
        heartRateZoneType: 'cardio',
        minBeatsPerMinute: '140',
        maxBeatsPerMinute: '160'
      }
    ]
  };

  it('maps to a vital-signs Observation with the Google Health code', () => {
    const observation = mapDailyHeartRateZonesToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'daily-heart-rate-zones', display: 'Daily heart rate zones' }]
      }
    });
  });

  it('formats the date into a padded ISO effectiveDateTime', () => {
    const observation = mapDailyHeartRateZonesToFHIR({ ...base, date: { year: 2026, month: 1, day: 5 } });

    expect(observation.effectiveDateTime).toBe('2026-01-05');
  });
  it('maps each zone into min and max components', () => {
    const observation = mapDailyHeartRateZonesToFHIR(base);

    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'heart-rate-zone-min', display: 'fat-burn min heart rate' }] },
      valueQuantity: { value: 100, unit: 'beats/minute', system: UCUM, code: '/min' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'heart-rate-zone-max', display: 'fat-burn max heart rate' }] },
      valueQuantity: { value: 140, unit: 'beats/minute', system: UCUM, code: '/min' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'heart-rate-zone-min', display: 'cardio min heart rate' }] },
      valueQuantity: { value: 140, unit: 'beats/minute', system: UCUM, code: '/min' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'heart-rate-zone-max', display: 'cardio max heart rate' }] },
      valueQuantity: { value: 160, unit: 'beats/minute', system: UCUM, code: '/min' }
    });
  });
});

describe('mapDailyOxygenSaturationToFHIR', () => {
  const base: health_v4.Schema$DailyOxygenSaturation = {
    date: { year: 2026, month: 6, day: 20 },
    averagePercentage: 98,
    lowerBoundPercentage: 95,
    upperBoundPercentage: 99,
    standardDeviationPercentage: 1.5
  };

  it('maps to a vital-signs Observation with the LOINC code', () => {
    const observation = mapDailyOxygenSaturationToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry' }]
      }
    });
  });

  it('formats the date into a padded ISO effectiveDateTime', () => {
    const observation = mapDailyOxygenSaturationToFHIR({ ...base, date: { year: 2026, month: 1, day: 5 } });

    expect(observation.effectiveDateTime).toBe('2026-01-05');
  });
});

describe('mapDailyRespiratoryRateToFHIR', () => {
  const base: health_v4.Schema$DailyRespiratoryRate = {
    date: { year: 2026, month: 6, day: 20 },
    breathsPerMinute: 16
  };

  it('maps to a vital-signs Observation with the LOINC code', () => {
    const observation = mapDailyRespiratoryRateToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '9279-1', display: 'Respiratory rate' }]
      }
    });
  });

  it('formats the date into a padded ISO effectiveDateTime', () => {
    const observation = mapDailyRespiratoryRateToFHIR({ ...base, date: { year: 2026, month: 1, day: 5 } });

    expect(observation.effectiveDateTime).toBe('2026-01-05');
  });
});

describe('mapDailyRestingHeartRateToFHIR', () => {
  const base: health_v4.Schema$DailyRestingHeartRate = {
    beatsPerMinute: '60',
    date: { year: 2026, month: 6, day: 20 },
    dailyRestingHeartRateMetadata: {
      calculationMethod: 'average-of-lowest-30-percent'
    }
  };

  it('maps to a vital-signs Observation with the LOINC code', () => {
    const observation = mapDailyRestingHeartRateToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '40443-4', display: 'Heart rate --resting' }]
      }
    });
  });

  it('formats the date into a padded ISO effectiveDateTime', () => {
    const observation = mapDailyRestingHeartRateToFHIR({ ...base, date: { year: 2026, month: 1, day: 5 } });

    expect(observation.effectiveDateTime).toBe('2026-01-05');
  });

  it('maps the calculation method into the method.text field', () => {
    const observation = mapDailyRestingHeartRateToFHIR(base);

    expect(observation.method).toEqual({ text: 'average-of-lowest-30-percent' });
  });
});

describe('mapDailySleepTemperatureDerivationsToFHIR', () => {
  const base: health_v4.Schema$DailySleepTemperatureDerivations = {
    baselineTemperatureCelsius: 36.5,
    date: { year: 2026, month: 6, day: 20 },
    nightlyTemperatureCelsius: 36.8,
    relativeNightlyStddev30dCelsius: 0.2
  };

  it('maps to a vital-signs Observation with the Google Health code', () => {
    const observation = mapDailySleepTemperatureDerivationsToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [
          {
            system: GOOGLE_HEALTH,
            code: 'daily-sleep-temperature-derivations',
            display: 'Daily sleep temperature derivations'
          }
        ]
      }
    });
  });

  it('formats the date into a padded ISO effectiveDateTime', () => {
    const observation = mapDailySleepTemperatureDerivationsToFHIR({ ...base, date: { year: 2026, month: 1, day: 5 } });

    expect(observation.effectiveDateTime).toBe('2026-01-05');
  });

  it('maps each temperature metric into components', () => {
    const observation = mapDailySleepTemperatureDerivationsToFHIR(base);

    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'nightly-temperature', display: 'Nightly skin temperature' }] },
      valueQuantity: { value: 36.8, unit: 'Cel', system: UCUM, code: 'Cel' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'baseline-temperature', display: 'Baseline skin temperature' }] },
      valueQuantity: { value: 36.5, unit: 'Cel', system: UCUM, code: 'Cel' }
    });
    expect(observation.component).toContainEqual({
      code: {
        coding: [
          {
            system: GOOGLE_HEALTH,
            code: 'relative-nightly-stddev-30d',
            display: 'Relative nightly temperature standard deviation (30d)'
          }
        ]
      },
      valueQuantity: { value: 0.2, unit: 'Cel', system: UCUM, code: 'Cel' }
    });
  });
});

describe('mapDailyVo2MaxToFHIR', () => {
  const base: health_v4.Schema$DailyVO2Max = {
    cardioFitnessLevel: 'excellent',
    date: { year: 2026, month: 6, day: 20 },
    vo2Max: 45,
    vo2MaxCovariance: 0.5
  };

  it('maps to a vital-signs Observation with the Google Health code', () => {
    const observation = mapDailyVo2MaxToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'daily-vo2-max', display: 'Daily VO2 max' }]
      }
    });
  });

  it('formats the date into a padded ISO effectiveDateTime', () => {
    const observation = mapDailyVo2MaxToFHIR({ ...base, date: { year: 2026, month: 1, day: 5 } });

    expect(observation.effectiveDateTime).toBe('2026-01-05');
  });

  it('maps each VO2 max metric into components', () => {
    const observation = mapDailyVo2MaxToFHIR(base);

    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'cardio-fitness-level', display: 'Cardio fitness level' }] },
      valueString: 'excellent'
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'vo2-max-covariance', display: 'VO2 max covariance' }] },
      valueQuantity: { value: 0.5 }
    });
  });
});
