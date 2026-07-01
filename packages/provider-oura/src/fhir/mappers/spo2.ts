import type { Observation } from 'fhir/r4';
import type { OuraSpo2List } from '../../api/schemas/spo2'; // Adjust path as needed
import { SYSTEMS } from './shared';

export function mapOuraSpo2ToFHIR(ouraData: OuraSpo2List): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No SpO2 data available to map to FHIR.');
  }

  const fhirObservations: Observation[] = [];

  for (const spo2 of ouraData.data) {
    const components: Observation['component'] = [];

    if (spo2.spo2_percentage && spo2.spo2_percentage.average !== null) {
      components.push({
        code: {
          coding: [
            {
              system: SYSTEMS.LOINC,
              code: '59408-5',
              display: 'Oxygen saturation average'
            }
          ]
        },
        valueQuantity: {
          value: spo2.spo2_percentage.average,
          unit: '%',
          system: SYSTEMS.UCUM,
          code: '%'
        }
      });
    }

    if (spo2.breathing_disturbance_index !== null) {
      components.push({
        code: {
          coding: [
            {
              system: SYSTEMS.OURA_CUSTOM,
              code: 'breathing_disturbance_index',
              display: 'Breathing Disturbance Index'
            }
          ]
        },
        valueQuantity: {
          value: spo2.breathing_disturbance_index,
          unit: 'events/hour',
          system: SYSTEMS.UCUM,
          code: '/h'
        }
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
              code: 'vital-signs',
              display: 'Vital Signs'
            }
          ]
        }
      ],
      code: {
        coding: [
          {
            system: SYSTEMS.OURA_CUSTOM,
            code: 'spo2_daily_summary',
            display: 'Oura Daily SpO2 Summary'
          }
        ]
      },
      subject: {
        reference: 'Patient/example'
      },
      identifier: [
        {
          system: 'https://ouraring.com/spo2/id',
          value: spo2.id
        }
      ],
      effectiveDateTime: spo2.day
    };

    if (components.length > 0) {
      observation.component = components;
    }

    fhirObservations.push(observation);
  }

  return fhirObservations;
}
