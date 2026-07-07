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

const DATE: health_v4.Schema$Date = { year: 2026, month: 6, day: 20 };

describe('mapDailyHeartRateVariabilityToFHIR', () => {
  const base: health_v4.Schema$DailyHeartRateVariability = {
    date: DATE,
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

  it('maps populated metrics into components', () => {
    const observation = mapDailyHeartRateVariabilityToFHIR(base);

    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'average-heart-rate-variability', display: 'Average HRV (RMSSD)' }]
      },
      valueQuantity: { value: 45, unit: 'ms', system: UCUM, code: 'ms' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'entropy', display: 'Heartbeat entropy' }] },
      valueQuantity: { value: 2.5 }
    });
  });

  it('omits components for missing metrics', () => {
    const observation = mapDailyHeartRateVariabilityToFHIR({ date: DATE });

    expect(observation.component).toBeUndefined();
  });
});

describe('mapDailyHeartRateZonesToFHIR', () => {
  const base: health_v4.Schema$DailyHeartRateZones = {
    date: DATE,
    heartRateZones: [{ heartRateZoneType: 'FAT_BURN', minBeatsPerMinute: '90', maxBeatsPerMinute: '120' }]
  };

  it('maps each zone into min and max components', () => {
    const observation = mapDailyHeartRateZonesToFHIR(base);

    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'heart-rate-zone-min', display: 'FAT_BURN min heart rate' }] },
      valueQuantity: { value: 90, unit: 'beats/minute', system: UCUM, code: '/min' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'heart-rate-zone-max', display: 'FAT_BURN max heart rate' }] },
      valueQuantity: { value: 120, unit: 'beats/minute', system: UCUM, code: '/min' }
    });
  });

  it('falls back to a generic zone display when the type is missing', () => {
    const observation = mapDailyHeartRateZonesToFHIR({
      date: DATE,
      heartRateZones: [{ minBeatsPerMinute: '100' }]
    });

    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'heart-rate-zone-min', display: 'zone min heart rate' }] },
      valueQuantity: { value: 100, unit: 'beats/minute', system: UCUM, code: '/min' }
    });
  });

  it('produces no components when there are no zones', () => {
    const observation = mapDailyHeartRateZonesToFHIR({ date: DATE });

    expect(observation.component).toBeUndefined();
  });
});

describe('mapDailyOxygenSaturationToFHIR', () => {
  const base: health_v4.Schema$DailyOxygenSaturation = {
    date: DATE,
    averagePercentage: 97,
    lowerBoundPercentage: 95,
    upperBoundPercentage: 99,
    standardDeviationPercentage: 1.2
  };

  it('uses the LOINC oxygen saturation code and root valueQuantity', () => {
    const observation = mapDailyOxygenSaturationToFHIR(base);

    expect(observation.code).toEqual({
      coding: [{ system: LOINC, code: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry' }]
    });
    expect(observation.valueQuantity).toEqual({ value: 97, unit: '%', system: UCUM, code: '%' });
  });

  it('omits the root valueQuantity when the average is missing', () => {
    const { averagePercentage: _avg, ...withoutAverage } = base;
    const observation = mapDailyOxygenSaturationToFHIR(withoutAverage);

    expect(observation.valueQuantity).toBeUndefined();
  });

  it('maps the bound and deviation components', () => {
    const observation = mapDailyOxygenSaturationToFHIR(base);

    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'lower-bound-percentage', display: 'Lower bound oxygen saturation' }]
      },
      valueQuantity: { value: 95, unit: '%', system: UCUM, code: '%' }
    });
    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'upper-bound-percentage', display: 'Upper bound oxygen saturation' }]
      },
      valueQuantity: { value: 99, unit: '%', system: UCUM, code: '%' }
    });
  });
});

describe('mapDailyRespiratoryRateToFHIR', () => {
  it('maps the breaths per minute into the root valueQuantity', () => {
    const observation = mapDailyRespiratoryRateToFHIR({ date: DATE, breathsPerMinute: 14 });

    expect(observation.code).toEqual({ coding: [{ system: LOINC, code: '9279-1', display: 'Respiratory rate' }] });
    expect(observation.valueQuantity).toEqual({ value: 14, unit: 'breaths/minute', system: UCUM, code: '/min' });
  });

  it('omits the valueQuantity when breaths per minute is missing', () => {
    const observation = mapDailyRespiratoryRateToFHIR({ date: DATE });

    expect(observation.valueQuantity).toBeUndefined();
  });
});

describe('mapDailyRestingHeartRateToFHIR', () => {
  it('maps the resting heart rate into the root valueQuantity', () => {
    const observation = mapDailyRestingHeartRateToFHIR({ date: DATE, beatsPerMinute: '58' });

    expect(observation.code).toEqual({ coding: [{ system: LOINC, code: '40443-4', display: 'Heart rate --resting' }] });
    expect(observation.valueQuantity).toEqual({ value: 58, unit: 'beats/minute', system: UCUM, code: '/min' });
  });

  it('adds the calculation method when present in metadata', () => {
    const observation = mapDailyRestingHeartRateToFHIR({
      date: DATE,
      beatsPerMinute: '58',
      dailyRestingHeartRateMetadata: { calculationMethod: 'SLEEP' }
    });

    expect(observation.method).toEqual({ text: 'SLEEP' });
  });

  it('omits the method when metadata has no calculation method', () => {
    const observation = mapDailyRestingHeartRateToFHIR({ date: DATE, beatsPerMinute: '58' });

    expect(observation.method).toBeUndefined();
  });
});

describe('mapDailySleepTemperatureDerivationsToFHIR', () => {
  const base: health_v4.Schema$DailySleepTemperatureDerivations = {
    date: DATE,
    nightlyTemperatureCelsius: 36.5,
    baselineTemperatureCelsius: 36.2,
    relativeNightlyStddev30dCelsius: 0.3
  };

  it('maps the temperature metrics into Celsius components', () => {
    const observation = mapDailySleepTemperatureDerivationsToFHIR(base);

    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'nightly-temperature', display: 'Nightly skin temperature' }] },
      valueQuantity: { value: 36.5, unit: 'Cel', system: UCUM, code: 'Cel' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'baseline-temperature', display: 'Baseline skin temperature' }] },
      valueQuantity: { value: 36.2, unit: 'Cel', system: UCUM, code: 'Cel' }
    });
  });

  it('omits components when temperatures are missing', () => {
    const observation = mapDailySleepTemperatureDerivationsToFHIR({ date: DATE });

    expect(observation.component).toBeUndefined();
  });
});

describe('mapDailyVo2MaxToFHIR', () => {
  const base: health_v4.Schema$DailyVO2Max = {
    date: DATE,
    vo2Max: 42,
    cardioFitnessLevel: 'GOOD',
    vo2MaxCovariance: 0.05
  };

  it('maps the VO2 max into the root valueQuantity', () => {
    const observation = mapDailyVo2MaxToFHIR(base);

    expect(observation.code).toEqual({
      coding: [{ system: GOOGLE_HEALTH, code: 'daily-vo2-max', display: 'Daily VO2 max' }]
    });
    expect(observation.valueQuantity).toEqual({ value: 42, unit: 'mL/kg/min', system: UCUM, code: 'mL/kg/min' });
  });

  it('maps the cardio fitness level into a string component', () => {
    const observation = mapDailyVo2MaxToFHIR(base);

    expect(observation.component).toContainEqual({
      code: { coding: [{ system: GOOGLE_HEALTH, code: 'cardio-fitness-level', display: 'Cardio fitness level' }] },
      valueString: 'GOOD'
    });
  });

  it('omits the valueQuantity when VO2 max is missing', () => {
    const observation = mapDailyVo2MaxToFHIR({ date: DATE });

    expect(observation.valueQuantity).toBeUndefined();
  });
});
