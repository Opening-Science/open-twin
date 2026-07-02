import { describe, expect, it } from 'vitest';
import type { OuraRestMode, OuraRestModeList } from '../../api/schemas/restmode';
import { mapOuraRestModeToFHIR } from '../../fhir/mappers/restmode';
import { SYSTEMS } from '../../fhir/mappers/shared';

const REST_MODE_URL = `${SYSTEMS.OURA_CUSTOM}#tag/Rest-Mode-Period-Routes`;

describe('mapOuraRestModeToFHIR', () => {
  const restmode: OuraRestMode = {
    id: '123',
    end_day: '2026-07-20',
    end_time: '2026-07-20T23:59:59Z',
    start_day: '2026-07-01',
    start_time: '2026-07-01T00:00:00Z',
    episodes: [
      {
        tag: ['tag1', 'tag2'],
        timestamp: '2026-07-10T12:00:00Z'
      }
    ]
  };
  it('throws an error when no rest mode data is provided', () => {
    expect(() => mapOuraRestModeToFHIR(null as unknown as OuraRestModeList)).toThrow(
      'No rest mode data available to map to FHIR.'
    );
  });

  it('throws an error when the response contains an empty data array', () => {
    const input: OuraRestModeList = { data: [], next_token: null };

    expect(() => mapOuraRestModeToFHIR(input)).toThrow('No rest mode data available to map to FHIR.');
  });

  it('should map OuraRestMode to FHIR Observation correctly', () => {
    const [result] = mapOuraRestModeToFHIR({ data: [restmode] });

    expect(result).toEqual({
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
            system: 'https://cloud.ouraring.com/v2/docs#tag/Rest-Mode-Period-Routes',
            code: 'rest-mode',
            display: 'Oura Rest Mode'
          }
        ]
      },
      subject: {
        reference: 'Patient/example'
      },
      identifier: [
        {
          system: REST_MODE_URL,
          value: restmode.id
        }
      ],
      effectivePeriod: {
        start: restmode.start_time,
        end: restmode.end_time
      },
      extension: [
        {
          url: REST_MODE_URL,
          valueString: restmode.start_day
        },
        {
          url: REST_MODE_URL,
          valueString: restmode.end_day
        },
        {
          url: REST_MODE_URL,
          valueString: '2026-07-10T12:00:00Z [tag1, tag2]'
        }
      ]
    });
  });

  it('omits the start_day and end_day extensions when they are null', () => {
    const input: OuraRestModeList = {
      data: [{ ...restmode, start_day: null, end_day: null }]
    };

    const [result] = mapOuraRestModeToFHIR(input);

    expect(result.extension).toEqual([{ url: REST_MODE_URL, valueString: '2026-07-10T12:00:00Z [tag1, tag2]' }]);
  });

  it('omits the tag suffix when an episode has no tags', () => {
    const input: OuraRestModeList = {
      data: [
        {
          ...restmode,
          start_day: null,
          end_day: null,
          episodes: [{ timestamp: '2026-07-11T09:00:00Z' }, { tag: [], timestamp: '2026-07-11T10:00:00Z' }]
        }
      ]
    };

    const [result] = mapOuraRestModeToFHIR(input);

    expect(result.extension).toEqual([
      { url: REST_MODE_URL, valueString: '2026-07-11T09:00:00Z' },
      { url: REST_MODE_URL, valueString: '2026-07-11T10:00:00Z' }
    ]);
  });

  it('maps every episode to its own extension', () => {
    const input: OuraRestModeList = {
      data: [
        {
          ...restmode,
          start_day: null,
          end_day: null,
          episodes: [
            { tag: ['a'], timestamp: '2026-07-12T08:00:00Z' },
            { tag: ['b', 'c'], timestamp: '2026-07-12T09:00:00Z' }
          ]
        }
      ]
    };

    const [result] = mapOuraRestModeToFHIR(input);

    expect(result.extension).toEqual([
      { url: REST_MODE_URL, valueString: '2026-07-12T08:00:00Z [a]' },
      { url: REST_MODE_URL, valueString: '2026-07-12T09:00:00Z [b, c]' }
    ]);
  });

  it('omits the extension property when there are no days or episodes', () => {
    const input: OuraRestModeList = {
      data: [{ ...restmode, start_day: null, end_day: null, episodes: undefined }]
    };

    const [result] = mapOuraRestModeToFHIR(input);

    expect(result.extension).toBeUndefined();
  });

  it('maps every entry in the list preserving order', () => {
    const input: OuraRestModeList = {
      data: [restmode, { ...restmode, id: '456' }]
    };

    const results = mapOuraRestModeToFHIR(input);

    expect(results).toHaveLength(2);
    expect(results[0].identifier?.[0].value).toBe('123');
    expect(results[1].identifier?.[0].value).toBe('456');
  });
});
