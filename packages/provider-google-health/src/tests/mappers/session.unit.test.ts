import type { health_v4 } from 'googleapis';
import { describe, expect, it } from 'vitest';
import { mapElectrocardiogramToFHIR, mapExerciseToFHIR, mapHydrationLogToFHIR } from '../../fhir/mappers/session';

const GOOGLE_HEALTH = 'https://developers.google.com/health/data-types';
const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';

describe('mapElectrocardiogramToFHIR', () => {
  const base: health_v4.Schema$Electrocardiogram = {
    interval: { startTime: '2026-06-20T12:00:00Z', endTime: '2026-06-20T12:05:00Z' },
    beatsPerMinuteAvg: '70',
    resultClassification: 'normal',
    samplingFrequencyHertz: 250,
    leadNumber: 12,
    medicalDeviceInfo: { deviceModel: 'ECG Model X' }
  };

  it('maps to a vital-signs Observation with the LOINC code', () => {
    const observation = mapElectrocardiogramToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '11524-6', display: 'EKG study' }]
      }
    });
  });

  it('maps populated metrics into components', () => {
    const observation = mapElectrocardiogramToFHIR(base);

    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: LOINC, code: '8867-4', display: 'Heart rate' }]
      },
      valueQuantity: { value: 70, unit: 'beats/minute', system: UCUM, code: '/min' }
    });

    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'result-classification', display: 'ECG result classification' }]
      },
      valueString: 'normal'
    });

    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'sampling-frequency-hertz', display: 'Sampling frequency' }]
      },
      valueQuantity: { value: 250, unit: 'Hz', system: UCUM, code: 'Hz' }
    });

    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'lead-number', display: 'Number of leads' }]
      },
      valueQuantity: { value: 12 }
    });
  });

  it('maps medical device info to the device field', () => {
    const observation = mapElectrocardiogramToFHIR(base);

    expect(observation.device).toEqual({ display: 'ECG Model X' });
  });
});

describe('mapExerciseToFHIR', () => {
  const base: health_v4.Schema$Exercise = {
    interval: { startTime: '2026-06-20T12:00:00Z', endTime: '2026-06-20T12:30:00Z' },
    displayName: 'Morning Run',
    exerciseType: 'RUNNING',
    metricsSummary: {
      activeZoneMinutes: '30',
      averageHeartRateBeatsPerMinute: '150',
      steps: '2000',
      caloriesKcal: 30
    }
  };

  it('maps to an activity Observation with the Google Health code', () => {
    const observation = mapExerciseToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'activity', display: 'Activity' }]
        }
      ],
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'exercise', display: 'Morning Run' }]
      }
    });
  });

  it('maps populated metrics into components', () => {
    const observation = mapExerciseToFHIR(base);

    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'exercise-type', display: 'Exercise type' }]
      },
      valueString: 'RUNNING'
    });

    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: 'http://loinc.org', code: '41981-2', display: 'Calories burned' }]
      },
      valueQuantity: { value: 30, unit: 'kcal', system: UCUM, code: 'kcal' }
    });

    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'steps', display: 'Steps' }]
      },
      valueQuantity: { value: 2000, unit: 'steps' }
    });
  });
});

describe('mapHydrationLogToFHIR', () => {
  const base: health_v4.Schema$HydrationLog = {
    interval: { startTime: '2026-06-20T12:00:00Z', endTime: '2026-06-20T12:30:00Z' },
    amountConsumed: { milliliters: 500 }
  };

  it('maps to an activity Observation with the Google Health code', () => {
    const observation = mapHydrationLogToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'hydration-log', display: 'Hydration log' }]
      }
    });
  });

  it('maps amount consumed to valueQuantity', () => {
    const observation = mapHydrationLogToFHIR(base);

    expect(observation.valueQuantity).toEqual({
      value: 500,
      unit: 'mL',
      system: UCUM,
      code: 'mL'
    });
  });
});
