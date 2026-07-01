import { describe, expect, it } from 'vitest';
import type { OuraStress, OuraStressList } from '../../api/schemas/stress';
import { SYSTEMS } from '../../fhir/mappers/shared';
import { mapOuraStressToFHIR } from '../../fhir/mappers/stress';

describe('mapOuraStressToFHIR', () => {
  const baseStress: OuraStress = {
    id: 'stress-1',
    day: '2026-06-20',
    stress_high: 120,
    recovery_high: 60
  };
  it('throws an error when no stress data is provided', () => {
    expect(() => mapOuraStressToFHIR(null as unknown as OuraStressList)).toThrow(
      'No stress data available to map to FHIR.'
    );
  });

  it('throws an error when the response contains an empty data array', () => {
    const input: OuraStressList = { data: [], next_token: null };

    expect(() => mapOuraStressToFHIR(input)).toThrow('No stress data available to map to FHIR.');
  });

  it('maps a fully populated entry to a FHIR Observation resource', () => {
    const input: OuraStressList = { data: [baseStress], next_token: null };

    const [observation] = mapOuraStressToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              system: SYSTEMS.OBSERVATION_CATEGORY,
              code: 'activity',
              display: 'Activity'
            }
          ]
        }
      ],
      code: {
        coding: [
          {
            system: SYSTEMS.OURA_CUSTOM,
            code: 'daily-stress',
            display: 'Oura Daily Stress'
          }
        ]
      },
      subject: { reference: 'Patient/example' },
      identifier: [{ system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Stress-Routes`, value: 'stress-1' }],
      effectiveDateTime: '2026-06-20'
    });
  });
});
