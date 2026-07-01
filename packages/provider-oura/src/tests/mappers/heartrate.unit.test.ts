import { describe, expect, it } from 'vitest';
import type { OuraHeartRate, OuraHeartRateList } from '../../api/schemas/heartrate';
import { mapOuraHeartRateToFHIR } from '../../fhir/mappers/heartrate';

describe('mapOuraHeartRateToFHIR', () => {
  const baseEntry: OuraHeartRate = {
    timestamp: '2026-06-20T04:00:00+00:00',
    producer_timestamp: 123412341234,
    bpm: 60,
    source: 'awake' as const
  };

  it('maps a fully populated entry to a FHIR Observation resource', () => {
    const input: OuraHeartRateList = { data: [baseEntry], next_token: null };

    const [observation] = mapOuraHeartRateToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs'
            }
          ]
        }
      ],
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '8867-4',
            display: 'Heart rate'
          }
        ]
      },
      effectiveDateTime: '2026-06-20T04:00:00+00:00',
      valueQuantity: {
        value: 60,
        unit: 'beats/minute',
        system: 'http://unitsofmeasure.org',
        code: '/min'
      },
      extension: [
        {
          url: 'https://cloud.ouraring.com/v2/docs#tag/Heart-Rate-Routes',
          valueString: 'awake'
        },
        {
          url: 'https://cloud.ouraring.com/v2/docs#tag/Heart-Rate-Routes',
          valueString: '123412341234'
        }
      ]
    });
  });

  it('sets the subject reference to the example patient', () => {
    const input: OuraHeartRateList = { data: [baseEntry], next_token: null };

    const [observation] = mapOuraHeartRateToFHIR(input);

    expect(observation.subject?.reference).toBe('Patient/example');
  });

  it('includes the producer_timestamp as a second extension', () => {
    const input: OuraHeartRateList = { data: [baseEntry], next_token: null };

    const [observation] = mapOuraHeartRateToFHIR(input);

    expect(observation.extension).toHaveLength(2);
    expect(observation.extension?.[1]).toEqual({
      url: 'https://cloud.ouraring.com/v2/docs#tag/Heart-Rate-Routes',
      valueString: '123412341234'
    });
  });

  it.each([
    'awake',
    'workout',
    'rest',
    'sleep',
    'live',
    'session'
  ] as const)('maps the "%s" source into the first extension', (source) => {
    const input: OuraHeartRateList = { data: [{ ...baseEntry, source }], next_token: null };

    const [observation] = mapOuraHeartRateToFHIR(input);

    expect(observation.extension?.[0]).toEqual({
      url: 'https://cloud.ouraring.com/v2/docs#tag/Heart-Rate-Routes',
      valueString: source
    });
  });

  it('maps every entry in the list preserving order', () => {
    const input: OuraHeartRateList = {
      data: [
        { ...baseEntry, timestamp: '2026-06-20T04:00:00+00:00', bpm: 60 },
        { ...baseEntry, timestamp: '2026-06-20T04:05:00+00:00', bpm: 62 }
      ],
      next_token: null
    };

    const observations = mapOuraHeartRateToFHIR(input);

    expect(observations).toHaveLength(2);
    expect(observations[0].valueQuantity?.value).toBe(60);
    expect(observations[0].effectiveDateTime).toBe('2026-06-20T04:00:00+00:00');
    expect(observations[1].valueQuantity?.value).toBe(62);
    expect(observations[1].effectiveDateTime).toBe('2026-06-20T04:05:00+00:00');
  });

  it('throws an error when no data is provided', () => {
    const input: OuraHeartRateList = { data: [], next_token: null };

    expect(() => mapOuraHeartRateToFHIR(input)).toThrowError('No heart rate data available to map to FHIR.');
  });

  it('throws an error when the data property is missing', () => {
    const input = { next_token: null } as unknown as OuraHeartRateList;

    expect(() => mapOuraHeartRateToFHIR(input)).toThrowError('No heart rate data available to map to FHIR.');
  });
});
