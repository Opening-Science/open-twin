import { describe, expect, it } from 'vitest';
import type { Session, SessionList } from '../../api/schemas/session';
import { mapOuraSessionToFHIR } from '../../fhir/mappers/session';
import { SYSTEMS } from '../../fhir/mappers/shared';

describe('mapOuraSessionToFHIR', () => {
  const baseSession: Session = {
    id: 'session-1',
    day: '2026-06-20',
    start_datetime: '2026-06-20T08:00:00+00:00',
    end_datetime: '2026-06-20T08:15:00+00:00',
    type: 'meditation',
    mood: 'good',
    heart_rate: { interval: 5, items: [60, 62, 64], timestamp: '2026-06-20T08:00:00+00:00' },
    heart_rate_variability: { interval: 5, items: [40, 50], timestamp: '2026-06-20T08:00:00+00:00' },
    motion_count: { interval: 5, items: [1, 3], timestamp: '2026-06-20T08:00:00+00:00' }
  };
  it('throws an error when no session data is provided', () => {
    expect(() => mapOuraSessionToFHIR(null as unknown as SessionList)).toThrow(
      'No session data available to map to FHIR.'
    );
  });

  it('throws an error when the response contains an empty data array', () => {
    const input: SessionList = { data: [], next_token: null };

    expect(() => mapOuraSessionToFHIR(input)).toThrow('No session data available to map to FHIR.');
  });

  it('maps a fully populated entry to a FHIR Observation resource', () => {
    const input: SessionList = { data: [baseSession], next_token: null };

    const [observation] = mapOuraSessionToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: SYSTEMS.OBSERVATION_CATEGORY, code: 'activity', display: 'Activity' }]
        }
      ],
      code: {
        coding: [{ system: SYSTEMS.OURA_CUSTOM, code: 'session', display: 'Oura Session' }],
        text: 'meditation'
      },
      subject: { reference: 'Patient/example' },
      identifier: [{ system: `${SYSTEMS.OURA_CUSTOM}#tag/Session-Routes`, value: 'session-1' }],
      effectivePeriod: {
        start: '2026-06-20T08:00:00+00:00',
        end: '2026-06-20T08:15:00+00:00'
      }
    });
  });

  it('averages the sample items into heart rate, HRV and motion count components', () => {
    const input: SessionList = { data: [baseSession], next_token: null };

    const [observation] = mapOuraSessionToFHIR(input);

    expect(observation.component).toHaveLength(3);
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: SYSTEMS.LOINC, code: '8867-4', display: 'Heart rate' }] },
      valueQuantity: { value: 62, unit: 'beats/minute', system: SYSTEMS.UCUM, code: '/min' }
    });
    expect(observation.component).toContainEqual({
      code: {
        coding: [{ system: SYSTEMS.OURA_CUSTOM, code: 'heart-rate-variability', display: 'Heart Rate Variability' }]
      },
      valueQuantity: { value: 45, unit: 'ms', system: SYSTEMS.UCUM, code: 'ms' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: SYSTEMS.OURA_CUSTOM, code: 'motion-count', display: 'Motion Count' }] },
      valueQuantity: { value: 2, unit: 'count', system: SYSTEMS.UCUM, code: '{count}' }
    });
  });

  it('adds type, day and mood extensions', () => {
    const input: SessionList = { data: [baseSession], next_token: null };

    const [observation] = mapOuraSessionToFHIR(input);

    const url = `${SYSTEMS.OURA_CUSTOM}#tag/Session-Routes`;
    expect(observation.extension).toEqual([
      { url, valueString: 'meditation' },
      { url, valueString: '2026-06-20' },
      { url, valueString: 'good' }
    ]);
  });

  it('omits the mood extension when mood is null', () => {
    const input: SessionList = {
      data: [{ ...baseSession, mood: null }],
      next_token: null
    };

    const [observation] = mapOuraSessionToFHIR(input);

    const url = `${SYSTEMS.OURA_CUSTOM}#tag/Session-Routes`;
    expect(observation.extension).toEqual([
      { url, valueString: 'meditation' },
      { url, valueString: '2026-06-20' }
    ]);
  });

  it('omits sample components when their samples are null', () => {
    const input: SessionList = {
      data: [{ ...baseSession, heart_rate: null, heart_rate_variability: null, motion_count: null }],
      next_token: null
    };

    const [observation] = mapOuraSessionToFHIR(input);

    expect(observation.component).toBeUndefined();
  });

  it('ignores null values when averaging sample items', () => {
    const input: SessionList = {
      data: [
        {
          ...baseSession,
          heart_rate: {
            interval: 5,
            items: [60, null as unknown as number, 70],
            timestamp: '2026-06-20T08:00:00+00:00'
          },
          heart_rate_variability: null,
          motion_count: null
        }
      ],
      next_token: null
    };

    const [observation] = mapOuraSessionToFHIR(input);

    expect(observation.component).toHaveLength(1);
    expect(observation.component?.[0].valueQuantity?.value).toBe(65);
  });

  it('omits a sample component when its items array is empty', () => {
    const input: SessionList = {
      data: [
        {
          ...baseSession,
          heart_rate: { interval: 5, items: [], timestamp: '2026-06-20T08:00:00+00:00' },
          heart_rate_variability: null,
          motion_count: null
        }
      ],
      next_token: null
    };

    const [observation] = mapOuraSessionToFHIR(input);

    expect(observation.component).toBeUndefined();
  });

  it('maps every entry in the list preserving order', () => {
    const input: SessionList = {
      data: [baseSession, { ...baseSession, id: 'session-2', day: '2026-06-21' }],
      next_token: null
    };

    const observations = mapOuraSessionToFHIR(input);

    expect(observations).toHaveLength(2);
    expect(observations[0].identifier?.[0].value).toBe('session-1');
    expect(observations[1].identifier?.[0].value).toBe('session-2');
  });
});
