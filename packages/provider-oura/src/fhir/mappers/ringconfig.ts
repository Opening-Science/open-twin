import type { Observation } from 'fhir/r4';
import type { OuraRingConfigResponseList } from '../../api/schemas/ringconfig';
import { SYSTEMS } from './shared';

export function mapOuraRingConfigToFHIR(ouraData: OuraRingConfigResponseList): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No ring configuration data available to map to FHIR.');
  }

  const fhirObservations: Observation[] = [];

  for (const ring of ouraData.data) {
    const extensions: Observation['extension'] = [];

    const addExtension = (urlFragment: string, value: string | null | undefined) => {
      if (value === undefined || value === null) return;
      extensions.push({
        url: `${SYSTEMS.OURA_CUSTOM}/${urlFragment}`,
        valueString: value
      });
    };

    addExtension('ring-hardware-type', ring.hardware_type);
    addExtension('ring-color', ring.color);
    addExtension('ring-design', ring.design);
    addExtension('ring-firmware-version', ring.firmware_version);

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
            code: 'ring-configuration',
            display: 'Oura Ring Configuration'
          }
        ]
      },
      subject: {
        reference: 'Patient/example'
      },
      identifier: [
        {
          system: `${SYSTEMS.OURA_CUSTOM}#tag/Ring-Configuration-Routes`,
          value: ring.id
        }
      ],
      device: {
        reference: `Device/${ring.id}`
      }
    };

    if (ring.set_up_at !== undefined && ring.set_up_at !== null) {
      observation.effectiveDateTime = ring.set_up_at;
    }

    if (ring.size !== undefined && ring.size !== null) {
      observation.valueQuantity = {
        value: ring.size,
        unit: 'size',
        system: SYSTEMS.UCUM,
        code: '{size}'
      };
    }

    if (extensions.length > 0) {
      observation.extension = extensions;
    }

    fhirObservations.push(observation);
  }

  return fhirObservations;
}
