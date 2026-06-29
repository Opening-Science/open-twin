import type { Observation } from 'fhir/r4';
import type { OuraCardiovascularAgeList } from '../../api/schemas/cardiovascular';

const SYSTEMS = {
  LOINC: 'http://loinc.org',
  HL7_CATEGORY: 'http://terminology.hl7.org/CodeSystem/observation-category',
  UCUM: 'http://unitsofmeasure.org'
};

export function mapOuraCardiovascularAgeToFHIR(cardioAge: OuraCardiovascularAgeList): Observation[] {
  return cardioAge.data.map((cardioAge) => {
    const observation: Observation = {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              system: SYSTEMS.HL7_CATEGORY,
              code: 'exam',
              display: 'Exam'
            }
          ]
        }
      ],
      code: {
        coding: [
          {
            system: SYSTEMS.LOINC,
            code: '88059-1',
            display: 'Vascular age'
          }
        ]
      },
      identifier: [
        {
          system: 'https://ouraring.com/cardiovascular-age/id',
          value: cardioAge.id
        }
      ],
      // FHIR allows YYYY-MM-DD for effectiveDateTime
      effectiveDateTime: cardioAge.day
    };

    // 1. Map Vascular Age to valueQuantity
    if (cardioAge.vascular_age !== null && cardioAge.vascular_age !== undefined) {
      observation.valueQuantity = {
        value: cardioAge.vascular_age,
        unit: 'years',
        system: SYSTEMS.UCUM,
        code: 'a' // UCUM code for years
      };
    }

    // 2. Map Pulse Wave Velocity to a component
    if (cardioAge.pulse_wave_velocity !== null && cardioAge.pulse_wave_velocity !== undefined) {
      observation.component = [
        {
          code: {
            coding: [
              {
                system: SYSTEMS.LOINC,
                code: '85343-2',
                display: 'Pulse wave velocity'
              }
            ]
          },
          valueQuantity: {
            value: cardioAge.pulse_wave_velocity,
            unit: 'm/s',
            system: SYSTEMS.UCUM,
            code: 'm/s' // UCUM code for meters per second
          }
        }
      ];
    }

    return observation;
  });
}
