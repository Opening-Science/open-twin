import { describe, expect, it } from 'vitest';
import type { OuraCardiovascularAge, OuraCardiovascularAgeList } from '../../api/schemas/cardiovascular';
import { mapOuraCardiovascularAgeToFHIR } from '../../fhir/mappers/cardiovascular';

describe('mapOuraCardiovascularAgeToFHIR', () => {
  const baseEntry: OuraCardiovascularAge = {
    id: 'cardio-1',
    day: '2026-06-20',
    vascular_age: 32,
    pulse_wave_velocity: 7.5
  };

  it('maps a fully populated entry to a FHIR Observation resource', () => {
    const input: OuraCardiovascularAgeList = { data: [baseEntry], next_token: null };

    const [observation] = mapOuraCardiovascularAgeToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'exam',
              display: 'Exam'
            }
          ]
        }
      ],
      code: {
        coding: [{ system: 'http://loinc.org', code: '77195-6', display: 'Vascular age' }]
      },
      identifier: [
        { system: 'https://cloud.ouraring.com/v2/docs#tag/Daily-Cardiovascular-Age-Routes', value: 'cardio-1' }
      ],
      effectiveDateTime: '2026-06-20'
    });
  });

  it('maps vascular_age to valueQuantity in years', () => {
    const input: OuraCardiovascularAgeList = { data: [baseEntry], next_token: null };

    const [observation] = mapOuraCardiovascularAgeToFHIR(input);

    expect(observation.valueQuantity).toEqual({
      value: 32,
      unit: 'years',
      system: 'http://unitsofmeasure.org',
      code: 'a'
    });
  });

  it('maps pulse_wave_velocity to a component in m/s', () => {
    const input: OuraCardiovascularAgeList = { data: [baseEntry], next_token: null };

    const [observation] = mapOuraCardiovascularAgeToFHIR(input);

    expect(observation.component).toEqual([
      {
        code: {
          coding: [{ system: 'http://loinc.org', code: '77196-4', display: 'Pulse wave velocity' }]
        },
        valueQuantity: {
          value: 7.5,
          unit: 'm/s',
          system: 'http://unitsofmeasure.org',
          code: 'm/s'
        }
      }
    ]);
  });

  it('omits valueQuantity when vascular_age is null', () => {
    const input: OuraCardiovascularAgeList = {
      data: [{ ...baseEntry, vascular_age: null }],
      next_token: null
    };

    const [observation] = mapOuraCardiovascularAgeToFHIR(input);

    expect(observation.valueQuantity).toBeUndefined();
  });

  it('omits component when pulse_wave_velocity is null', () => {
    const input: OuraCardiovascularAgeList = {
      data: [{ ...baseEntry, pulse_wave_velocity: null }],
      next_token: null
    };

    const [observation] = mapOuraCardiovascularAgeToFHIR(input);

    expect(observation.component).toBeUndefined();
  });

  it('maps every entry in the list preserving order', () => {
    const input: OuraCardiovascularAgeList = {
      data: [
        { ...baseEntry, id: 'cardio-1', day: '2026-06-20' },
        { ...baseEntry, id: 'cardio-2', day: '2026-06-21' }
      ],
      next_token: null
    };

    const observations = mapOuraCardiovascularAgeToFHIR(input);

    expect(observations).toHaveLength(2);
    expect(observations[0].identifier?.[0].value).toBe('cardio-1');
    expect(observations[0].effectiveDateTime).toBe('2026-06-20');
    expect(observations[1].identifier?.[0].value).toBe('cardio-2');
    expect(observations[1].effectiveDateTime).toBe('2026-06-21');
  });

  it('returns an empty array when the response contains no data', () => {
    const input: OuraCardiovascularAgeList = { data: [], next_token: null };

    expect(mapOuraCardiovascularAgeToFHIR(input)).toEqual([]);
  });
});
