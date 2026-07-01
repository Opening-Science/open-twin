import type { Bundle, Observation } from 'fhir/r4';
import type { OuraPersonal } from '../../api/schemas/personal';
import { SYSTEMS } from './shared';

interface FhirPatient {
  resourceType: 'Patient';
  id?: string;
  identifier?: Observation['identifier'];
  gender?: string;
  birthDate?: string;
}

export function mapOuraPersonalToFHIR(person: OuraPersonal): Bundle {
  if (!person) {
    throw new Error('No personal data available to map to FHIR.');
  }

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: []
  };

  const currentYear = new Date().getFullYear();

  const patient: FhirPatient = {
    resourceType: 'Patient',
    identifier: [{ system: `${SYSTEMS.OURA_CUSTOM}#tag/Personal-Info-Routes`, value: person.id }]
  };

  if (person.biological_sex) {
    const sexStr = person.biological_sex.toLowerCase();
    patient.gender = ['male', 'female', 'other', 'unknown'].includes(sexStr) ? sexStr : 'unknown';
  }

  if (person.age !== null && person.age !== undefined) {
    patient.birthDate = (currentYear - person.age - 1).toString();
  }

  bundle.entry?.push({ resource: patient });

  const observationIdentifiers: Observation['identifier'] = [
    { system: `${SYSTEMS.OURA_CUSTOM}#tag/Personal-Info-Routes`, value: person.id }
  ];
  if (person.email) {
    observationIdentifiers.push({ system: 'email', value: person.email });
  }

  if (person.weight !== null && person.weight !== undefined) {
    bundle.entry?.push({
      resource: {
        resourceType: 'Observation',
        status: 'final',
        identifier: observationIdentifiers,
        category: [
          {
            coding: [{ system: SYSTEMS.OBSERVATION_CATEGORY, code: 'vital-signs' }]
          }
        ],
        code: {
          coding: [{ system: SYSTEMS.LOINC, code: '29463-7', display: 'Body weight' }]
        },
        subject: { reference: `Patient/${person.id}` },
        valueQuantity: {
          value: person.weight,
          unit: 'kg',
          system: SYSTEMS.UCUM,
          code: 'kg'
        }
      } as Observation
    });
  }

  if (person.height !== null && person.height !== undefined) {
    bundle.entry?.push({
      resource: {
        resourceType: 'Observation',
        status: 'final',
        identifier: observationIdentifiers,
        category: [
          {
            coding: [{ system: SYSTEMS.OBSERVATION_CATEGORY, code: 'vital-signs' }]
          }
        ],
        code: {
          coding: [{ system: SYSTEMS.LOINC, code: '8302-2', display: 'Body height' }]
        },
        subject: { reference: `Patient/${person.id}` },
        valueQuantity: {
          value: person.height,
          unit: 'm',
          system: SYSTEMS.UCUM,
          code: 'm'
        }
      } as Observation
    });
  }

  if (person.biological_sex) {
    bundle.entry?.push({
      resource: {
        resourceType: 'Observation',
        status: 'final',
        identifier: observationIdentifiers,
        category: [
          {
            coding: [
              {
                system: SYSTEMS.OBSERVATION_CATEGORY,
                code: 'social-history',
                display: 'Social History'
              }
            ]
          }
        ],
        code: {
          coding: [
            {
              system: SYSTEMS.LOINC,
              code: '99501-9',
              display: 'Sex assigned at birth'
            }
          ]
        },
        subject: { reference: `Patient/${person.id}` },
        valueString: person.biological_sex
      } as Observation
    });
  }

  return bundle;
}
