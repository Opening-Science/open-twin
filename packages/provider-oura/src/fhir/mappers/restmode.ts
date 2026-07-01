import type { Observation } from 'fhir/r4';
import type { OuraRestModeList } from '../../api/schemas/restmode';
import { SYSTEMS } from './shared';

export function mapOuraRestModeToFHIR(ouraData: OuraRestModeList): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No rest mode data available to map to FHIR.');
  }

  const fhirObservations: Observation[] = [];

  for (const restMode of ouraData.data) {
    const extensions: Observation['extension'] = [];

    if (restMode.start_day !== null) {
      extensions.push({
        url: `${SYSTEMS.OURA_CUSTOM}#tag/Rest-Mode-Period-Routes`,
        valueString: restMode.start_day
      });
    }
    if (restMode.end_day !== null) {
      extensions.push({
        url: `${SYSTEMS.OURA_CUSTOM}#tag/Rest-Mode-Period-Routes`,
        valueString: restMode.end_day
      });
    }

    for (const episode of restMode.episodes ?? []) {
      const tags = episode.tag && episode.tag.length > 0 ? ` [${episode.tag.join(', ')}]` : '';
      extensions.push({
        url: `${SYSTEMS.OURA_CUSTOM}#tag/Rest-Mode-Period-Routes`,
        valueString: `${episode.timestamp}${tags}`
      });
    }

    const observation: Observation = {
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
          value: restMode.id
        }
      ],
      effectivePeriod: {
        start: restMode.start_time,
        end: restMode.end_time
      }
    };

    if (extensions.length > 0) {
      observation.extension = extensions;
    }

    fhirObservations.push(observation);
  }

  return fhirObservations;
}
