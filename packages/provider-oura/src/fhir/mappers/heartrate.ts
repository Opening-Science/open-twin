import type { Observation } from 'fhir/r4';
import type { OuraHeartRateList } from '../../api/schemas/heartrate'; // Adjust path as needed

const SYSTEMS = {
  LOINC: 'http://loinc.org',
  UCUM: 'http://unitsofmeasure.org',
  OURA_CUSTOM: 'https://cloud.ouraring.com/v2/docs',
  OBSERVATION_CATEGORY: 'http://terminology.hl7.org/CodeSystem/observation-category'
};

export function mapOuraHeartRateToFHIR(ouraData: OuraHeartRateList): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No heart rate data available to map to FHIR.');
  }

  const fhirObservations: Observation[] = [];

  for (const hr of ouraData.data) {
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
            code: '8867-4',
            display: 'Heart rate'
          }
        ]
      },
      subject: {
        reference: 'Patient/example'
      },
      effectiveDateTime: hr.timestamp,
      valueQuantity: {
        value: hr.bpm,
        unit: 'beats/minute',
        system: SYSTEMS.UCUM,
        code: '/min'
      },
      extension: [
        {
          url: `${SYSTEMS.OURA_CUSTOM}#tag/Heart-Rate-Routes`,
          valueString: hr.source
        }
      ]
    };

    if (hr.producer_timestamp !== undefined && observation.extension) {
      observation.extension.push({
        url: `${SYSTEMS.OURA_CUSTOM}#tag/Heart-Rate-Routes`,
        valueString: hr.producer_timestamp.toString()
      });
    }

    fhirObservations.push(observation);
  }

  return fhirObservations;
}
