import { describe, expect, it } from 'vitest';
import type { OuraHeartRateList } from '../../api/schemas/heartrate';
import { mapOuraHeartRateToFHIR } from '../../fhir/mappers/heartrate';

describe('mapOuraHeartRateToFHIR', () => {
  const baseEntry = {
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
});
