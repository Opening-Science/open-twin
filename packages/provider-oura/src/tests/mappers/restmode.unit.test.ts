import { describe, expect, it } from 'vitest';
import { mapOuraRestModeToFHIR } from '../../fhir/mappers/restmode';
import { SYSTEMS } from '../../fhir/mappers/shared';

const restmode = {
  id: '123',
  end_day: '2026-07-20', // Format: YYYY-MM-DD
  end_time: '2026-07-20T23:59:59Z',
  start_day: '2026-07-01', // Format: YYYY-MM-DD
  start_time: '2026-07-01T00:00:00Z',
  episodes: [
    {
      tag: ['tag1', 'tag2'],
      timestamp: '2026-07-10T12:00:00Z'
    }
  ]
};

describe('mapOuraRestModeToFHIR', () => {
  it('should map OuraRestMode to FHIR Observation correctly', () => {
    const result = mapOuraRestModeToFHIR({ data: [restmode] });

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
            system: SYSTEMS.OURA_CUSTOM,
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
          system: `${SYSTEMS.OURA_CUSTOM}#tag/Rest-Mode-Period-Routes`,
          value: restmode.id
        }
      ],
      effectivePeriod: {
        start: restmode.start_time,
        end: restmode.end_time
      },
      extension: [
        {
          url: `${SYSTEMS.OURA_CUSTOM}#tag/Rest-Mode-Period-Routes`,
          valueString: restmode.start_day
        },
        {
          url: `${SYSTEMS.OURA_CUSTOM}#tag/Rest-Mode-Period-Routes`,
          valueString: restmode.end_day
        },
        {
          url: `${SYSTEMS.OURA_CUSTOM}#tag/Rest-Mode-Period-Routes`,
          valueString: `${restmode.episodes[0].timestamp} [${restmode.episodes[0].tag.join(', ')}]`
        }
      ]
    });
  });
});
