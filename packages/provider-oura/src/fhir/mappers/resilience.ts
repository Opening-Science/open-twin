import type { Observation } from 'fhir/r4';
import type { OuraResilienceResponseList } from '../../api/schemas/resilience';
import { SYSTEMS } from './shared';

export function mapOuraResilienceToFHIR(ouraData: OuraResilienceResponseList): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No resilience data available to map to FHIR.');
  }

  return ouraData.data.map((resilience) => {
    const components: Observation['component'] = [];

    const addComponent = (value: number | undefined, coding: { system: string; code: string; display: string }) => {
      if (value === undefined) return;
      components.push({
        code: { coding: [coding] },
        valueQuantity: { value, unit: 'score', system: SYSTEMS.UCUM, code: '{score}' }
      });
    };

    addComponent(resilience.contributors.sleep_recovery, {
      system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Resilience-Routes`,
      code: 'sleep-recovery',
      display: 'Sleep Recovery'
    });
    addComponent(resilience.contributors.daytime_recovery, {
      system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Resilience-Routes`,
      code: 'daytime-recovery',
      display: 'Daytime Recovery'
    });
    addComponent(resilience.contributors.stress, {
      system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Resilience-Routes`,
      code: 'stress',
      display: 'Stress'
    });

    const observation: Observation = {
      resourceType: 'Observation',
      identifier: [
        {
          system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Resilience-Routes`,
          value: `oura-resilience-${resilience.id}`
        }
      ],
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
            system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Resilience-Routes`,
            code: 'resilience-level',
            display: 'Oura Resilience Level'
          }
        ]
      },
      subject: {
        reference: 'Patient/example'
      },
      effectiveDateTime: resilience.day,
      component: components.length > 0 ? components : undefined
    };

    if (resilience.level !== undefined) {
      observation.valueString = resilience.level;
    }

    return observation;
  });
}
