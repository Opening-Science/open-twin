import { describe, expect, it } from 'vitest';
import type { OuraReadinessItem, OuraReadinessResponseList } from '../../api/schemas/readiness';
import { mapOuraReadinessToFHIR } from '../../fhir/mappers/readiness';

const OURA_CUSTOM = 'https://cloud.ouraring.com/v2/docs';
const UCUM = 'http://unitsofmeasure.org';
const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';
const DATA_ABSENT = 'http://terminology.hl7.org/CodeSystem/data-absent-reason';

const baseEntry: OuraReadinessItem = {
  id: 'readiness-1',
  day: '2026-06-20',
  timestamp: '2026-06-20T08:00:00+00:00',
  score: 82,
  contributors: {
    activity_balance: 90,
    hrv_balance: 85,
    previous_day_activity: 70,
    previous_night: 95,
    recovery_index: 88,
    resting_heart_rate: 92,
    sleep_balance: 80,
    sleep_regularity: 75
  },
  temperature_deviation: 0.3,
  temperature_trend_deviation: 0.1
};

describe('mapOuraReadinessToFHIR', () => {
  it('throws an error when no readiness data is provided', () => {
    expect(() => mapOuraReadinessToFHIR(null as unknown as OuraReadinessResponseList)).toThrow(
      'No readiness data available to map to FHIR.'
    );
  });

  it('throws an error when the response contains an empty data array', () => {
    const input: OuraReadinessResponseList = { data: [], next_token: null };

    expect(() => mapOuraReadinessToFHIR(input)).toThrow('No readiness data available to map to FHIR.');
  });

  it('maps a fully populated entry to a FHIR Observation resource', () => {
    const input: OuraReadinessResponseList = { data: [baseEntry], next_token: null };

    const [observation] = mapOuraReadinessToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: OBSERVATION_CATEGORY, code: 'activity', display: 'Activity' }]
        }
      ],
      code: {
        coding: [{ system: OURA_CUSTOM, code: 'readiness-score', display: 'Oura Readiness Score' }]
      },
      identifier: [{ system: OURA_CUSTOM, value: 'oura-readiness-readiness-1' }],
      subject: { reference: 'Patient/example' },
      effectiveDateTime: '2026-06-20T08:00:00.000Z'
    });
  });

  it('maps the readiness score to valueQuantity', () => {
    const input: OuraReadinessResponseList = { data: [baseEntry], next_token: null };

    const [observation] = mapOuraReadinessToFHIR(input);

    expect(observation.valueQuantity).toEqual({
      value: 82,
      unit: 'Score',
      system: UCUM,
      code: '{score}'
    });
    expect(observation.dataAbsentReason).toBeUndefined();
  });

  it('maps all contributor scores and temperature deviations to components', () => {
    const input: OuraReadinessResponseList = { data: [baseEntry], next_token: null };

    const [observation] = mapOuraReadinessToFHIR(input);

    expect(observation.component).toHaveLength(10);
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: OURA_CUSTOM, code: 'activity-balance', display: 'Activity Balance' }] },
      valueQuantity: { value: 90, unit: 'Score', system: UCUM, code: '{score}' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: OURA_CUSTOM, code: 'temperature-deviation', display: 'Temperature Deviation' }] },
      valueQuantity: { value: 0.3, unit: '°C', system: UCUM, code: 'Cel' }
    });
    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: OURA_CUSTOM, code: 'temperature-trend-deviation', display: 'Temperature Trend Deviation' }]
      },
      valueQuantity: { value: 0.1, unit: '°C', system: UCUM, code: 'Cel' }
    });
  });

  it('sets dataAbsentReason and omits valueQuantity when score is null', () => {
    const input: OuraReadinessResponseList = {
      data: [{ ...baseEntry, score: null }],
      next_token: null
    };

    const [observation] = mapOuraReadinessToFHIR(input);

    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.dataAbsentReason).toEqual({
      coding: [{ system: DATA_ABSENT, code: 'unknown', display: 'Unknown' }]
    });
  });

  it('omits contributor components when their values are null or undefined', () => {
    const input: OuraReadinessResponseList = {
      data: [
        {
          ...baseEntry,
          contributors: {
            activity_balance: 90,
            hrv_balance: null
          },
          temperature_deviation: null,
          temperature_trend_deviation: undefined
        }
      ],
      next_token: null
    };

    const [observation] = mapOuraReadinessToFHIR(input);

    expect(observation.component).toHaveLength(1);
    expect(observation.component?.[0].code?.coding?.[0].code).toBe('activity-balance');
  });

  it('sets component to undefined when no contributors or temperatures are present', () => {
    const input: OuraReadinessResponseList = {
      data: [
        {
          ...baseEntry,
          contributors: {},
          temperature_deviation: null,
          temperature_trend_deviation: null
        }
      ],
      next_token: null
    };

    const [observation] = mapOuraReadinessToFHIR(input);

    expect(observation.component).toBeUndefined();
  });

  it('maps every entry in the list preserving order', () => {
    const input: OuraReadinessResponseList = {
      data: [
        { ...baseEntry, id: 'readiness-1', timestamp: '2026-06-20T08:00:00+00:00' },
        { ...baseEntry, id: 'readiness-2', timestamp: '2026-06-21T08:00:00+00:00' }
      ],
      next_token: null
    };

    const observations = mapOuraReadinessToFHIR(input);

    expect(observations).toHaveLength(2);
    expect(observations[0].identifier?.[0].value).toBe('oura-readiness-readiness-1');
    expect(observations[0].effectiveDateTime).toBe('2026-06-20T08:00:00.000Z');
    expect(observations[1].identifier?.[0].value).toBe('oura-readiness-readiness-2');
    expect(observations[1].effectiveDateTime).toBe('2026-06-21T08:00:00.000Z');
  });
});
