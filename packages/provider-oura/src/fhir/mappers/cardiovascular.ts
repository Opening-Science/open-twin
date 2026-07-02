import type { Observation } from 'fhir/r4';
import type { OuraCardiovascularAgeList } from '../../api/schemas/cardiovascular';
import { SYSTEMS } from './shared';

export function mapOuraCardiovascularAgeToFHIR(cardioAge: OuraCardiovascularAgeList): Observation[] {
  return cardioAge.data.map((cardioAge) => {
    const observation: Observation = {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              system: SYSTEMS.OBSERVATION_CATEGORY,
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
            code: '77195-6',
            display: 'Vascular age'
          }
        ]
      },
      identifier: [
        {
          system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Cardiovascular-Age-Routes`,
          value: cardioAge.id
        }
      ],

      effectiveDateTime: cardioAge.day
    };

    if (cardioAge.vascular_age !== null && cardioAge.vascular_age !== undefined) {
      observation.valueQuantity = {
        value: cardioAge.vascular_age,
        unit: 'years',
        system: SYSTEMS.UCUM,
        code: 'a' // UCUM code for years
      };
    }

    if (cardioAge.pulse_wave_velocity !== null && cardioAge.pulse_wave_velocity !== undefined) {
      observation.component = [
        {
          code: {
            coding: [
              {
                system: SYSTEMS.LOINC,
                code: '77196-4',
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
