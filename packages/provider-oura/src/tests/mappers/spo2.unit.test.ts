import { describe, expect, it } from 'vitest';
import type { OuraSpo2, OuraSpo2List } from '../../api/schemas/spo2';
import { SYSTEMS } from '../../fhir/mappers/shared';
import { mapOuraSpo2ToFHIR } from '../../fhir/mappers/spo2';

describe('mapOuraSpo2ToFHIR', () => {
  const baseSpo2: OuraSpo2 = {
    id: 'spo2-1',
    day: '2026-06-20',
    spo2_percentage: { average: 97.5 },
    breathing_disturbance_index: 4
  };
  it('throws an error when no SpO2 data is provided', () => {
    expect(() => mapOuraSpo2ToFHIR(null as unknown as OuraSpo2List)).toThrow('No SpO2 data available to map to FHIR.');
  });

  it('throws an error when the response contains an empty data array', () => {
    const input: OuraSpo2List = { data: [], next_token: null };

    expect(() => mapOuraSpo2ToFHIR(input)).toThrow('No SpO2 data available to map to FHIR.');
  });

  it('maps a fully populated entry to a FHIR Observation resource', () => {
    const input: OuraSpo2List = { data: [baseSpo2], next_token: null };

    const [observation] = mapOuraSpo2ToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: SYSTEMS.OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }]
        }
      ],
      code: {
        coding: [
          {
            system: 'https://cloud.ouraring.com/v2/docs#tag/Daily-Spo2-Routes',
            code: 'spo2_daily_summary',
            display: 'Oura Daily SpO2 Summary'
          }
        ]
      },
      subject: { reference: 'Patient/example' },
      identifier: [{ system: 'https://cloud.ouraring.com/v2/docs#tag/Daily-Spo2-Routes', value: 'spo2-1' }],
      effectiveDateTime: '2026-06-20'
    });
  });

  it('maps the average SpO2 percentage and breathing disturbance index to components', () => {
    const input: OuraSpo2List = { data: [baseSpo2], next_token: null };

    const [observation] = mapOuraSpo2ToFHIR(input);

    expect(observation.component).toHaveLength(2);
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: SYSTEMS.LOINC, code: '59408-5', display: 'Oxygen saturation average' }] },
      valueQuantity: { value: 97.5, unit: '%', system: SYSTEMS.UCUM, code: '%' }
    });
    expect(observation.component).toContainEqual({
      code: {
        coding: [
          {
            system: 'https://cloud.ouraring.com/v2/docs#tag/Daily-Spo2-Routes',
            code: 'breathing_disturbance_index',
            display: 'Breathing Disturbance Index'
          }
        ]
      },
      valueQuantity: { value: 4, unit: 'events/hour', system: SYSTEMS.UCUM, code: '/h' }
    });
  });

  it('omits the SpO2 component when spo2_percentage is null', () => {
    const input: OuraSpo2List = {
      data: [{ ...baseSpo2, spo2_percentage: null }],
      next_token: null
    };

    const [observation] = mapOuraSpo2ToFHIR(input);

    expect(observation.component).toHaveLength(1);
    expect(observation.component?.[0].code?.coding?.[0].code).toBe('breathing_disturbance_index');
  });

  it('omits the breathing disturbance component when its value is null', () => {
    const input: OuraSpo2List = {
      data: [{ ...baseSpo2, breathing_disturbance_index: null }],
      next_token: null
    };

    const [observation] = mapOuraSpo2ToFHIR(input);

    expect(observation.component).toHaveLength(1);
    expect(observation.component?.[0].code?.coding?.[0].code).toBe('59408-5');
  });

  it('sets component to undefined when no measurements are present', () => {
    const input: OuraSpo2List = {
      data: [{ ...baseSpo2, spo2_percentage: null, breathing_disturbance_index: null }],
      next_token: null
    };

    const [observation] = mapOuraSpo2ToFHIR(input);

    expect(observation.component).toBeUndefined();
  });

  it('maps every entry in the list preserving order', () => {
    const input: OuraSpo2List = {
      data: [baseSpo2, { ...baseSpo2, id: 'spo2-2', day: '2026-06-21' }],
      next_token: null
    };

    const observations = mapOuraSpo2ToFHIR(input);

    expect(observations).toHaveLength(2);
    expect(observations[0].identifier?.[0].value).toBe('spo2-1');
    expect(observations[0].effectiveDateTime).toBe('2026-06-20');
    expect(observations[1].identifier?.[0].value).toBe('spo2-2');
    expect(observations[1].effectiveDateTime).toBe('2026-06-21');
  });
});
