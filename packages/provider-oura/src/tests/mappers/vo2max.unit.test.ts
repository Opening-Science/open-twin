import { describe, expect, it } from 'vitest';
import type { OuraVO2MaxItem, OuraVO2MaxResponseList } from '../../api/schemas/vo2max';
import { SYSTEMS } from '../../fhir/mappers/shared';
import { mapOuraVO2MaxToFHIR } from '../../fhir/mappers/vo2max';

describe('mapOuraVO2MaxToFHIR', () => {
  const baseVO2Max: OuraVO2MaxItem = {
    id: 'vo2max-1',
    day: '2026-06-20',
    timestamp: '2026-06-20T08:00:00+00:00',
    vo2_max: 48.5
  };
  it('throws an error when no VO2 max data is provided', () => {
    expect(() => mapOuraVO2MaxToFHIR(null as unknown as OuraVO2MaxResponseList)).toThrow(
      'No VO2 max data available to map to FHIR.'
    );
  });

  it('throws an error when the response contains an empty data array', () => {
    const input: OuraVO2MaxResponseList = { data: [], next_token: null };

    expect(() => mapOuraVO2MaxToFHIR(input)).toThrow('No VO2 max data available to map to FHIR.');
  });

  it('maps a fully populated entry to a FHIR Observation resource', () => {
    const input: OuraVO2MaxResponseList = { data: [baseVO2Max], next_token: null };

    const [observation] = mapOuraVO2MaxToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: SYSTEMS.OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [{ system: SYSTEMS.LOINC, code: '96803-2', display: 'Oxygen consumption (VO2max)' }]
      },
      subject: { reference: 'Patient/example' },
      identifier: [{ system: 'https://ouraring.com/vo2max/id', value: 'vo2max-1' }],
      effectiveDateTime: '2026-06-20T08:00:00+00:00'
    });
  });

  it('maps the VO2 max value to valueQuantity', () => {
    const input: OuraVO2MaxResponseList = { data: [baseVO2Max], next_token: null };

    const [observation] = mapOuraVO2MaxToFHIR(input);

    expect(observation.valueQuantity).toEqual({
      value: 48.5,
      unit: 'mL/min/kg',
      system: SYSTEMS.UCUM,
      code: 'mL/min/kg'
    });
  });

  it('omits valueQuantity when vo2_max is undefined', () => {
    const input: OuraVO2MaxResponseList = {
      data: [{ ...baseVO2Max, vo2_max: undefined }],
      next_token: null
    };

    const [observation] = mapOuraVO2MaxToFHIR(input);

    expect(observation.valueQuantity).toBeUndefined();
  });

  it('maps a vo2_max value of zero to valueQuantity', () => {
    const input: OuraVO2MaxResponseList = {
      data: [{ ...baseVO2Max, vo2_max: 0 }],
      next_token: null
    };

    const [observation] = mapOuraVO2MaxToFHIR(input);

    expect(observation.valueQuantity?.value).toBe(0);
  });

  it('maps every entry in the list preserving order', () => {
    const input: OuraVO2MaxResponseList = {
      data: [baseVO2Max, { ...baseVO2Max, id: 'vo2max-2', day: '2026-06-21', timestamp: '2026-06-21T08:00:00+00:00' }],
      next_token: null
    };

    const observations = mapOuraVO2MaxToFHIR(input);

    expect(observations).toHaveLength(2);
    expect(observations[0].identifier?.[0].value).toBe('vo2max-1');
    expect(observations[0].effectiveDateTime).toBe('2026-06-20T08:00:00+00:00');
    expect(observations[1].identifier?.[0].value).toBe('vo2max-2');
    expect(observations[1].effectiveDateTime).toBe('2026-06-21T08:00:00+00:00');
  });
});
