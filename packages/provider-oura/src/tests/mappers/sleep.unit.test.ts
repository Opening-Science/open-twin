import { describe, expect, it } from 'vitest';
import type { OuraSleep, OuraSleepList } from '../../api/schemas/sleep';
import { SYSTEMS } from '../../fhir/mappers/shared';
import { mapOuraSleepToFHIR } from '../../fhir/mappers/sleep';

describe('mapOuraSleepToFHIR', () => {
  const baseSleep: OuraSleep = {
    id: 'sleep-1',
    bedtime_start: '2026-06-20T23:00:00+00:00',
    bedtime_end: '2026-06-21T07:00:00+00:00',
    day: '2026-06-21',
    score: 88,
    type: 'long_sleep',
    rem_sleep_duration: 5400,
    deep_sleep_duration: 3600,
    efficiency: 95,
    latency: 600,
    lowest_heart_rate: 48,
    time_in_bed: 28800,
    total_sleep_duration: 27000,
    sleep_algorithm_version: 'v2',
    sleep_analysis_reason: 'normal',
    ring_id: 'ring-9',
    sleep_phase_30_sec: '111222333',
    temperature_deviation: 0.2
  };

  it('throws an error when no sleep data is provided', () => {
    expect(() => mapOuraSleepToFHIR(null as unknown as OuraSleepList)).toThrow(
      'No sleep data available to map to FHIR.'
    );
  });

  it('throws an error when the response contains an empty data array', () => {
    const input: OuraSleepList = { data: [], next_token: null };

    expect(() => mapOuraSleepToFHIR(input)).toThrow('No sleep data available to map to FHIR.');
  });

  it('maps a fully populated entry to a FHIR Observation resource', () => {
    const input: OuraSleepList = { data: [baseSleep], next_token: null };

    const [observation] = mapOuraSleepToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [
          {
            system: 'https://cloud.ouraring.com/v2/docs#tag/Sleep-Routes',
            code: 'sleep',
            display: 'Oura Sleep Observation'
          }
        ]
      },
      subject: { reference: 'Patient/example' },
      identifier: [{ system: 'https://cloud.ouraring.com/v2/docs#tag/Sleep-Routes', value: 'sleep-1' }],
      effectivePeriod: {
        start: '2026-06-20T23:00:00+00:00',
        end: '2026-06-21T07:00:00+00:00'
      }
    });
  });

  it('maps the sleep score to valueQuantity', () => {
    const input: OuraSleepList = { data: [baseSleep], next_token: null };

    const [observation] = mapOuraSleepToFHIR(input);

    expect(observation.valueQuantity).toEqual({
      value: 88,
      system: 'https://cloud.ouraring.com/v2/docs#tag/Sleep-Routes',
      code: 'sleep_score'
    });
  });

  it('maps optional metadata to category, method, note and device', () => {
    const input: OuraSleepList = { data: [baseSleep], next_token: null };

    const [observation] = mapOuraSleepToFHIR(input);

    expect(observation.category).toEqual([
      { coding: [{ system: 'https://cloud.ouraring.com/v2/docs#tag/Sleep-Routes', code: 'long_sleep' }] }
    ]);
    expect(observation.method).toEqual({ text: 'v2' });
    expect(observation.note).toEqual([{ text: 'normal' }]);
    expect(observation.device).toEqual({ reference: 'Device/ring-9' });
  });

  it('maps known duration metrics to LOINC/SNOMED components', () => {
    const input: OuraSleepList = { data: [baseSleep], next_token: null };

    const [observation] = mapOuraSleepToFHIR(input);

    expect(observation.component).toContainEqual({
      code: { coding: [{ system: SYSTEMS.LOINC, code: '93829-0', display: 'REM sleep duration' }] },
      valueQuantity: { value: 5400 }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: SYSTEMS.LOINC, code: '93831-6', display: 'Deep sleep duration' }] },
      valueQuantity: { value: 3600 }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: SYSTEMS.SNOMED, code: '248263006', display: 'Sleep efficiency' }] },
      valueQuantity: { value: 95 }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: SYSTEMS.LOINC, code: '40443-4', display: 'Resting heart rate' }] },
      valueQuantity: { value: 48 }
    });
  });

  it('maps deviation and phase data to Oura custom components and extensions', () => {
    const input: OuraSleepList = { data: [baseSleep], next_token: null };

    const [observation] = mapOuraSleepToFHIR(input);

    expect(observation.component).toContainEqual({
      code: { coding: [{ system: SYSTEMS.OURA_CUSTOM, code: 'temperature_deviation' }] },
      valueQuantity: { value: 0.2 }
    });
    expect(observation.extension).toContainEqual({
      url: `${SYSTEMS.OURA_CUSTOM}/day`,
      valueString: '2026-06-21'
    });
    expect(observation.extension).toContainEqual({
      url: `${SYSTEMS.OURA_CUSTOM}/sleep_phase_30_sec`,
      valueString: '111222333'
    });
  });

  it('omits optional resource properties when their fields are absent', () => {
    const minimalSleep: OuraSleep = {
      id: 'sleep-min',
      bedtime_start: '2026-06-20T23:00:00+00:00',
      bedtime_end: '2026-06-21T07:00:00+00:00',
      day: '2026-06-21'
    };
    const input: OuraSleepList = { data: [minimalSleep], next_token: null };

    const [observation] = mapOuraSleepToFHIR(input);

    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.category).toBeUndefined();
    expect(observation.method).toBeUndefined();
    expect(observation.note).toBeUndefined();
    expect(observation.device).toBeUndefined();
    expect(observation.component).toBeUndefined();
    expect(observation.extension).toEqual([{ url: `${SYSTEMS.OURA_CUSTOM}/day`, valueString: '2026-06-21' }]);
  });

  it('maps every entry in the list preserving order', () => {
    const input: OuraSleepList = {
      data: [baseSleep, { ...baseSleep, id: 'sleep-2', day: '2026-06-22' }],
      next_token: null
    };

    const observations = mapOuraSleepToFHIR(input);

    expect(observations).toHaveLength(2);
    expect(observations[0].identifier?.[0].value).toBe('sleep-1');
    expect(observations[1].identifier?.[0].value).toBe('sleep-2');
  });
});
