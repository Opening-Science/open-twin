import type { Observation } from 'fhir/r4';
import type { OuraStressList } from '../../api/schemas/stress';
import { SYSTEMS } from './shared';

export function mapOuraStressToFHIR(ouraData: OuraStressList): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No stress data available to map to FHIR.');
  }

  return ouraData.data.map((stress) => {
    const components: Observation['component'] = [];

    const addComponent = (
      value: number | null | undefined,
      coding: { system: string; code: string; display: string }
    ) => {
      if (value === undefined || value === null) return;
      components.push({
        code: { coding: [coding] },
        valueQuantity: { value, unit: 's', system: SYSTEMS.UCUM, code: 's' }
      });
    };

    addComponent(stress.stress_high, {
      system: SYSTEMS.OURA_CUSTOM,
      code: 'stress-high',
      display: 'Stress High Duration'
    });
    addComponent(stress.recovery_high, {
      system: SYSTEMS.OURA_CUSTOM,
      code: 'recovery-high',
      display: 'Recovery High Duration'
    });

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
            code: 'daily-stress',
            display: 'Oura Daily Stress'
          }
        ]
      },
      subject: {
        reference: 'Patient/example'
      },
      identifier: [
        {
          system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Stress-Routes`,
          value: stress.id
        }
      ],
      effectiveDateTime: stress.day,
      component: components.length > 0 ? components : undefined
    };

    if (stress.day_summary !== undefined && stress.day_summary !== null) {
      observation.valueString = stress.day_summary;
    }

    return observation;
  });
}
