import { describe, expect, it } from 'vitest';
import type { OuraResilienceItem, OuraResilienceResponseList } from '../../api/schemas/resilience';
import { mapOuraResilienceToFHIR } from '../../fhir/mappers/resilience';
import { SYSTEMS } from '../../fhir/mappers/shared';

describe('mapOuraResilienceToFHIR', () => {
  const baseResilience: OuraResilienceItem = {
    id: 'resilience-123',
    day: '2023-08-15',
    level: 'solid',
    contributors: {
      sleep_recovery: 10,
      daytime_recovery: 20,
      stress: 30
    }
  };
  it('throws an error when no resilience data is provided', () => {
    expect(() => mapOuraResilienceToFHIR(null as unknown as OuraResilienceResponseList)).toThrow(
      'No resilience data available to map to FHIR.'
    );
  });

  it('throws an error when the response contains an empty data array', () => {
    const input: OuraResilienceResponseList = { data: [], next_token: null };

    expect(() => mapOuraResilienceToFHIR(input)).toThrow('No resilience data available to map to FHIR.');
  });

  it('maps a fully populated entry to a FHIR Observation resource', () => {
    const input: OuraResilienceResponseList = { data: [baseResilience], next_token: null };

    const [observation] = mapOuraResilienceToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: SYSTEMS.OBSERVATION_CATEGORY, code: 'activity', display: 'Activity' }]
        }
      ],
      code: {
        coding: [
          {
            system: 'https://cloud.ouraring.com/v2/docs#tag/Daily-Resilience-Routes',
            code: 'resilience-level',
            display: 'Oura Resilience Level'
          }
        ]
      },
      identifier: [
        {
          system: 'https://cloud.ouraring.com/v2/docs#tag/Daily-Resilience-Routes',
          value: 'oura-resilience-resilience-123'
        }
      ],
      subject: { reference: 'Patient/example' },
      effectiveDateTime: '2023-08-15'
    });
  });

  it('maps the resilience level to valueString', () => {
    const input: OuraResilienceResponseList = { data: [baseResilience], next_token: null };

    const [observation] = mapOuraResilienceToFHIR(input);

    expect(observation.valueString).toBe('solid');
  });

  it('maps all contributors to observation components', () => {
    const input: OuraResilienceResponseList = { data: [baseResilience], next_token: null };

    const [observation] = mapOuraResilienceToFHIR(input);

    expect(observation.component).toHaveLength(3);
    expect(observation.component).toContainEqual({
      code: {
        coding: [
          {
            system: 'https://cloud.ouraring.com/v2/docs#tag/Daily-Resilience-Routes',
            code: 'sleep-recovery',
            display: 'Sleep Recovery'
          }
        ]
      },
      valueQuantity: { value: 10, unit: 'score', system: SYSTEMS.UCUM, code: '{score}' }
    });
    expect(observation.component).toContainEqual({
      code: {
        coding: [
          {
            system: 'https://cloud.ouraring.com/v2/docs#tag/Daily-Resilience-Routes',
            code: 'daytime-recovery',
            display: 'Daytime Recovery'
          }
        ]
      },
      valueQuantity: { value: 20, unit: 'score', system: SYSTEMS.UCUM, code: '{score}' }
    });
    expect(observation.component).toContainEqual({
      code: {
        coding: [
          {
            system: 'https://cloud.ouraring.com/v2/docs#tag/Daily-Resilience-Routes',
            code: 'stress',
            display: 'Stress'
          }
        ]
      },
      valueQuantity: { value: 30, unit: 'score', system: SYSTEMS.UCUM, code: '{score}' }
    });
  });

  it('omits contributor components when their values are undefined', () => {
    const input: OuraResilienceResponseList = {
      data: [{ ...baseResilience, contributors: { sleep_recovery: 10 } }],
      next_token: null
    };

    const [observation] = mapOuraResilienceToFHIR(input);

    expect(observation.component).toHaveLength(1);
    expect(observation.component?.[0].code?.coding?.[0].code).toBe('sleep-recovery');
    expect(observation.component?.[0].valueQuantity?.value).toBe(10);
  });

  it('sets component to undefined when no contributors are present', () => {
    const input: OuraResilienceResponseList = {
      data: [{ ...baseResilience, contributors: {} }],
      next_token: null
    };

    const [observation] = mapOuraResilienceToFHIR(input);

    expect(observation.component).toBeUndefined();
  });

  it('omits valueString when the level is undefined', () => {
    const input: OuraResilienceResponseList = {
      data: [{ ...baseResilience, level: undefined }],
      next_token: null
    };

    const [observation] = mapOuraResilienceToFHIR(input);

    expect(observation.valueString).toBeUndefined();
  });

  it('maps every entry in the list preserving order', () => {
    const input: OuraResilienceResponseList = {
      data: [baseResilience, { ...baseResilience, id: 'resilience-456', day: '2023-08-16', level: 'adequate' }],
      next_token: null
    };

    const observations = mapOuraResilienceToFHIR(input);

    expect(observations).toHaveLength(2);
    expect(observations[0].identifier?.[0].value).toBe('oura-resilience-resilience-123');
    expect(observations[0].effectiveDateTime).toBe('2023-08-15');
    expect(observations[1].identifier?.[0].value).toBe('oura-resilience-resilience-456');
    expect(observations[1].effectiveDateTime).toBe('2023-08-16');
    expect(observations[1].valueString).toBe('adequate');
  });
});
