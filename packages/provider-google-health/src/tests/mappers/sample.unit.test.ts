import type { health_v4 } from 'googleapis';
import { describe, expect, it } from 'vitest';
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
} from '../../fhir/mappers/sample';

const GOOGLE_HEALTH = 'https://developers.google.com/health/data-types';
const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';

describe('mapBloodGlucoseToFHIR', () => {
  const base: health_v4.Schema$BloodGlucose = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    bloodGlucoseMilligramsPerDeciliter: 120,
    mealType: 'fasting',
    measurementTiming: 'before-meal',
    specimen: 'capillary',
    notes: 'Fasting blood glucose measurement'
  };

  it('maps to a vital-signs Observation with the LOINC code for blood glucose', () => {
    const observation = mapBloodGlucoseToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '2339-0', display: 'Glucose [Mass/volume] in Blood' }]
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 120,
        unit: 'mg/dL',
        system: UCUM,
        code: 'mg/dL'
      },
      component: [
        {
          code: {
            coding: [{ system: GOOGLE_HEALTH, code: 'meal-type', display: 'Meal type' }]
          },
          valueString: 'fasting'
        },
        {
          code: {
            coding: [{ system: GOOGLE_HEALTH, code: 'measurement-timing', display: 'Measurement timing' }]
          },
          valueString: 'before-meal'
        },
        {
          code: {
            coding: [{ system: GOOGLE_HEALTH, code: 'specimen', display: 'Specimen source' }]
          },
          valueString: 'capillary'
        }
      ],
      note: [{ text: 'Fasting blood glucose measurement' }]
    });
  });

  it('omits components for missing optional fields', () => {
    const observation = mapBloodGlucoseToFHIR({ sampleTime: { physicalTime: '2026-06-20T12:00:00Z' } });

    expect(observation.component).toBeUndefined();
  });
});

describe('mapBodyFatToFHIR', () => {
  const base: health_v4.Schema$BodyFat = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    percentage: 25
  };

  it('maps to a vital-signs Observation with the LOINC code for body fat', () => {
    const observation = mapBodyFatToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '41982-0', display: 'Percentage of body fat Measured' }]
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 25,
        unit: '%',
        system: UCUM,
        code: '%'
      }
    });
  });

  it('omits valueQuantity for missing percentage', () => {
    const observation = mapBodyFatToFHIR({ sampleTime: { physicalTime: '2026-06-20T12:00:00Z' } });

    expect(observation.valueQuantity).toBeUndefined();
  });
});

describe('mapCoreBodyTemperatureToFHIR', () => {
  const base: health_v4.Schema$CoreBodyTemperature = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    temperatureCelsius: 37.5,
    measurementLocation: 'wrist',
    id: 'temp-123'
  };

  it('maps to a vital-signs Observation with the LOINC code for body temperature', () => {
    const observation = mapCoreBodyTemperatureToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '8310-5', display: 'Body temperature' }]
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 37.5,
        unit: 'Cel',
        system: UCUM,
        code: 'Cel'
      },
      component: [
        {
          code: {
            coding: [{ system: GOOGLE_HEALTH, code: 'measurement-location', display: 'Measurement location' }]
          },
          valueString: 'wrist'
        }
      ],
      identifier: [{ system: GOOGLE_HEALTH, value: 'temp-123' }]
    });
  });

  it('omits components for missing measurementLocation', () => {
    const observation = mapCoreBodyTemperatureToFHIR({
      sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
      temperatureCelsius: 37.5
    });

    expect(observation.component).toBeUndefined();
  });

  it('omits identifier for missing id', () => {
    const observation = mapCoreBodyTemperatureToFHIR({
      sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
      temperatureCelsius: 37.5
    });

    expect(observation.identifier).toBeUndefined();
  });
});

describe('mapHeartRateToFHIR', () => {
  const base: health_v4.Schema$HeartRate = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    beatsPerMinute: '72'
  };

  it('maps to a vital-signs Observation with the LOINC code for heart rate', () => {
    const observation = mapHeartRateToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '8867-4', display: 'Heart rate' }]
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 72,
        unit: 'beats/minute',
        system: UCUM,
        code: '/min'
      }
    });
  });

  it('omits valueQuantity for missing beatsPerMinute', () => {
    const observation = mapHeartRateToFHIR({ sampleTime: { physicalTime: '2026-06-20T12:00:00Z' } });

    expect(observation.valueQuantity).toBeUndefined();
  });
});

describe('mapHeartRateVariabilityToFHIR', () => {
  const base: health_v4.Schema$HeartRateVariability = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    standardDeviationMilliseconds: 45,
    rootMeanSquareOfSuccessiveDifferencesMilliseconds: 50
  };

  it('maps to a vital-signs Observation with the Google Health code for heart rate variability', () => {
    const observation = mapHeartRateVariabilityToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: GOOGLE_HEALTH, code: 'heart-rate-variability', display: 'Heart rate variability' }]
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 50,
        unit: 'ms',
        system: UCUM,
        code: 'ms'
      },
      component: [
        {
          code: {
            coding: [
              {
                system: GOOGLE_HEALTH,
                code: 'standard-deviation',
                display: 'HRV standard deviation (SDNN)'
              }
            ]
          },
          valueQuantity: { value: 45, unit: 'ms', system: UCUM, code: 'ms' }
        }
      ]
    });
  });

  it('omits components for missing standardDeviationMilliseconds', () => {
    const observation = mapHeartRateVariabilityToFHIR({
      sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
      rootMeanSquareOfSuccessiveDifferencesMilliseconds: 50
    });

    expect(observation.component).toBeUndefined();
  });
});

describe('mapHeightToFHIR', () => {
  const base: health_v4.Schema$Height = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    heightMillimeters: '1750'
  };

  it('maps to a vital-signs Observation with the LOINC code for height', () => {
    const observation = mapHeightToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }]
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 1750,
        unit: 'mm',
        system: UCUM,
        code: 'mm'
      }
    });
  });

  it('omits valueQuantity for missing heightMillimeters', () => {
    const observation = mapHeightToFHIR({ sampleTime: { physicalTime: '2026-06-20T12:00:00Z' } });

    expect(observation.valueQuantity).toBeUndefined();
  });
});

describe('mapOxygenSaturationToFHIR', () => {
  const base: health_v4.Schema$OxygenSaturation = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    percentage: 98
  };

  it('maps to a vital-signs Observation with the LOINC code for oxygen saturation', () => {
    const observation = mapOxygenSaturationToFHIR(base);

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
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 98,
        unit: '%',
        system: UCUM,
        code: '%'
      }
    });
  });

  it('omits valueQuantity for missing percentage', () => {
    const observation = mapOxygenSaturationToFHIR({ sampleTime: { physicalTime: '2026-06-20T12:00:00Z' } });

    expect(observation.valueQuantity).toBeUndefined();
  });
});

describe('mapRespiratoryRateSleepSummaryToFHIR', () => {
  const base: health_v4.Schema$RespiratoryRateSleepSummary = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    deepSleepStats: {
      breathsPerMinute: 15,
      signalToNoise: 0.8,
      standardDeviation: 1.2
    },
    fullSleepStats: {
      breathsPerMinute: 16,
      signalToNoise: 0.85,
      standardDeviation: 1.1
    },
    lightSleepStats: {
      breathsPerMinute: 17,
      signalToNoise: 0.9,
      standardDeviation: 1.3
    },
    remSleepStats: {
      breathsPerMinute: 18,
      signalToNoise: 0.95,
      standardDeviation: 1.4
    }
  };

  it('maps to a vital-signs Observation with the LOINC code for respiratory rate', () => {
    const observation = mapRespiratoryRateSleepSummaryToFHIR(base);

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
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 16,
        unit: 'breaths/minute',
        system: UCUM,
        code: '/min'
      },
      component: [
        {
          code: {
            coding: [
              { system: GOOGLE_HEALTH, code: 'deep-sleep-breaths-per-minute', display: 'Deep sleep respiratory rate' }
            ]
          },
          valueQuantity: { value: 15, unit: 'breaths/minute', system: UCUM, code: '/min' }
        },
        {
          code: {
            coding: [
              { system: GOOGLE_HEALTH, code: 'light-sleep-breaths-per-minute', display: 'Light sleep respiratory rate' }
            ]
          },
          valueQuantity: { value: 17, unit: 'breaths/minute', system: UCUM, code: '/min' }
        },
        {
          code: {
            coding: [
              { system: GOOGLE_HEALTH, code: 'rem-sleep-breaths-per-minute', display: 'REM sleep respiratory rate' }
            ]
          },
          valueQuantity: { value: 18, unit: 'breaths/minute', system: UCUM, code: '/min' }
        }
      ]
    });
  });

  it('omits components for missing sleep stats', () => {
    const observation = mapRespiratoryRateSleepSummaryToFHIR({ sampleTime: { physicalTime: '2026-06-20T12:00:00Z' } });

    expect(observation.component).toBeUndefined();
  });
});

describe('mapRunVo2MaxToFHIR', () => {
  const base: health_v4.Schema$RunVO2Max = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    runVo2Max: 45
  };

  it('maps to a vital-signs Observation with the LOINC code for running VO2 max', () => {
    const observation = mapRunVo2MaxToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '94122-9', display: 'Running VO2 max' }]
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 45,
        unit: 'mL/kg/min',
        system: UCUM,
        code: 'mL/kg/min'
      }
    });
  });

  it('omits valueQuantity for missing runVo2Max', () => {
    const observation = mapRunVo2MaxToFHIR({ sampleTime: { physicalTime: '2026-06-20T12:00:00Z' } });

    expect(observation.valueQuantity).toBeUndefined();
  });
});

describe('mapVo2MaxToFHIR', () => {
  const base: health_v4.Schema$VO2Max = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    vo2Max: 50
  };

  it('maps to a vital-signs Observation with the LOINC code for VO2 max', () => {
    const observation = mapVo2MaxToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '94122-9', display: 'VO2 max' }]
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 50,
        unit: 'mL/kg/min',
        system: UCUM,
        code: 'mL/kg/min'
      }
    });
  });

  it('omits valueQuantity for missing vo2Max', () => {
    const observation = mapVo2MaxToFHIR({ sampleTime: { physicalTime: '2026-06-20T12:00:00Z' } });

    expect(observation.valueQuantity).toBeUndefined();
  });
});

describe('mapWeightToFHIR', () => {
  const base: health_v4.Schema$Weight = {
    sampleTime: { physicalTime: '2026-06-20T12:00:00Z' },
    weightGrams: 70000
  };

  it('maps to a vital-signs Observation with the LOINC code for body weight', () => {
    const observation = mapWeightToFHIR(base);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }]
      },
      effectiveDateTime: '2026-06-20T12:00:00Z',
      valueQuantity: {
        value: 70000,
        unit: 'g',
        system: UCUM,
        code: 'g'
      }
    });
  });

  it('omits valueQuantity for missing weightGrams', () => {
    const observation = mapWeightToFHIR({ sampleTime: { physicalTime: '2026-06-20T12:00:00Z' } });

    expect(observation.valueQuantity).toBeUndefined();
  });
});
