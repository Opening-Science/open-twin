import type { Observation } from 'fhir/r4';
import type { OuraVO2MaxResponseList } from '../../api/schemas/vo2max';
import { SYSTEMS } from './shared';

export function mapOuraVO2MaxToFHIR(ouraData: OuraVO2MaxResponseList): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No VO2 max data available to map to FHIR.');
  }

  const fhirObservations: Observation[] = [];

  for (const vo2max of ouraData.data) {
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
            system: SYSTEMS.LOINC,
            code: '60842-2',
            display: 'Oxygen consumption (VO2max)'
          }
        ]
      },
      subject: {
        reference: 'Patient/example'
      },
      identifier: [
        {
          system: 'https://ouraring.com/vo2max/id',
          value: vo2max.id
        }
      ],
      effectiveDateTime: vo2max.timestamp
    };

    if (vo2max.vo2_max !== undefined) {
      observation.valueQuantity = {
        value: vo2max.vo2_max,
        unit: 'mL/min/kg',
        system: SYSTEMS.UCUM,
        code: 'mL/min/kg'
      };
    }

    fhirObservations.push(observation);
  }

  return fhirObservations;
}
