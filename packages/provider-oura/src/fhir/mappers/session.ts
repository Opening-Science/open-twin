import type { Observation } from 'fhir/r4';
import type { PublicSample, SessionList } from '../../api/schemas/session';
import { SYSTEMS } from './shared';

function averageSample(sample: PublicSample | null): number | undefined {
  if (!sample?.items || sample.items.length === 0) return undefined;
  const values = sample.items.filter((value): value is number => value !== null);
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function mapOuraSessionToFHIR(ouraData: SessionList): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No session data available to map to FHIR.');
  }

  const fhirObservations: Observation[] = [];

  for (const session of ouraData.data) {
    const components: Observation['component'] = [];
    const extensions: Observation['extension'] = [];

    const addComponent = (
      value: number | undefined,
      coding: { system: string; code: string; display: string },
      unit: string,
      code: string
    ) => {
      if (value === undefined) return;
      components.push({
        code: { coding: [coding] },
        valueQuantity: { value, unit, system: SYSTEMS.UCUM, code }
      });
    };

    addComponent(
      averageSample(session.heart_rate),
      { system: SYSTEMS.LOINC, code: '8867-4', display: 'Heart rate' },
      'beats/minute',
      '/min'
    );
    addComponent(
      averageSample(session.heart_rate_variability),
      {
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Session-Routes`,
        code: 'heart-rate-variability',
        display: 'Heart Rate Variability'
      },
      'ms',
      'ms'
    );
    addComponent(
      averageSample(session.motion_count),
      {
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Session-Routes`,
        code: 'motion-count',
        display: 'Motion Count'
      },
      'count',
      '{count}'
    );

    extensions.push({
      url: `${SYSTEMS.OURA_CUSTOM}#tag/Session-Routes`,
      valueString: session.type
    });
    extensions.push({
      url: `${SYSTEMS.OURA_CUSTOM}#tag/Session-Routes`,
      valueString: session.day
    });

    if (session.mood !== null) {
      extensions.push({
        url: `${SYSTEMS.OURA_CUSTOM}#tag/Session-Routes`,
        valueString: session.mood
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
            system: `${SYSTEMS.OURA_CUSTOM}#tag/Session-Routes`,
            code: 'session',
            display: 'Oura Session'
          }
        ],
        text: session.type
      },
      subject: {
        reference: 'Patient/example'
      },
      identifier: [
        {
          system: `${SYSTEMS.OURA_CUSTOM}#tag/Session-Routes`,
          value: session.id
        }
      ],
      effectivePeriod: {
        start: session.start_datetime,
        end: session.end_datetime
      },
      extension: extensions
    };

    if (components.length > 0) {
      observation.component = components;
    }

    fhirObservations.push(observation);
  }

  return fhirObservations;
}
