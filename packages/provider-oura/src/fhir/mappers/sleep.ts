import type { Observation } from 'fhir/r4';
import type { OuraSleepList } from '../../api/schemas/sleep';
import { SYSTEMS } from './shared';

export function mapOuraSleepToFHIR(ouraData: OuraSleepList): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No sleep data available to map to FHIR.');
  }
  const fhirObservations: Observation[] = [];

  for (const sleep of ouraData.data) {
    const components: Observation['component'] = [];
    const extensions: Observation['extension'] = [];

    const addComponent = (value: number | undefined, code: string, system: string, display?: string) => {
      if (value !== undefined) {
        components.push({
          code: {
            coding: [{ system, code, ...(display && { display }) }]
          },
          valueQuantity: { value }
        });
      }
    };

    const addExtension = (urlFragment: string, value: string | undefined) => {
      if (value !== undefined) {
        extensions.push({
          url: `${SYSTEMS.OURA_CUSTOM}/${urlFragment}`,
          valueString: value
        });
      }
    };

    addComponent(sleep.readiness_score_delta ?? 0, 'readiness_score_delta', SYSTEMS.OURA_CUSTOM);
    addComponent(sleep.rem_sleep_duration ?? 0, '93829-0', SYSTEMS.LOINC, 'REM sleep duration');
    addComponent(sleep.restless_periods ?? 0, 'restless_periods', SYSTEMS.OURA_CUSTOM);
    addComponent(sleep.sleep_score_delta ?? 0, 'sleep_score_delta', SYSTEMS.OURA_CUSTOM);
    addComponent(sleep.time_in_bed ?? 0, '103213-5', SYSTEMS.LOINC, 'Time in bed');
    addComponent(sleep.total_sleep_duration ?? 0, '93832-4', SYSTEMS.LOINC, 'Total sleep duration');
    addComponent(sleep.temperature_deviation ?? 0, 'temperature_deviation', SYSTEMS.OURA_CUSTOM);
    addComponent(sleep.temperature_trend_deviation ?? 0, 'temperature_trend_deviation', SYSTEMS.OURA_CUSTOM);
    addComponent(sleep.deep_sleep_duration ?? 0, '93831-6', SYSTEMS.LOINC, 'Deep sleep duration');
    addComponent(sleep.efficiency ?? 0, '248263006', SYSTEMS.SNOMED, 'Sleep efficiency');
    addComponent(sleep.latency ?? 0, '103212-7', SYSTEMS.LOINC, 'Sleep latency');
    addComponent(sleep.lowest_heart_rate ?? 0, '40443-4', SYSTEMS.LOINC, 'Resting heart rate');
    addComponent(sleep.average_heart_rate ?? 0, 'average_heart_rate', `${SYSTEMS.OURA_CUSTOM}#tag/Sleep-Routes`);
    addComponent(sleep.average_breath ?? 0, 'average_breath', `${SYSTEMS.OURA_CUSTOM}#tag/Sleep-Routes`);
    addComponent(sleep.average_hrv ?? 0, 'average_hrv', `${SYSTEMS.OURA_CUSTOM}#tag/Sleep-Routes`);
    addComponent(sleep.awake_time ?? 0, 'awake_time', `${SYSTEMS.OURA_CUSTOM}#tag/Sleep-Routes`);
    addComponent(sleep.light_sleep_duration ?? 0, 'light_sleep_duration', `${SYSTEMS.OURA_CUSTOM}#tag/Sleep-Routes`);
    addExtension('day', sleep.day);
    addExtension('sleep_phase_30_sec', sleep.sleep_phase_30_sec ?? '');
    addExtension('sleep_phase_5_min', sleep.sleep_phase_5_min ?? '');
    addExtension('app_sleep_phase_5_min', sleep.app_sleep_phase_5_min ?? '');

    const observation: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [
          {
            system: `${SYSTEMS.OURA_CUSTOM}#tag/Sleep-Routes`,
            code: 'sleep',
            display: 'Oura Sleep Observation'
          }
        ]
      },
      subject: {
        reference: 'Patient/example'
      },
      identifier: [
        {
          system: `${SYSTEMS.OURA_CUSTOM}#tag/Sleep-Routes`,
          value: sleep.id
        }
      ],
      effectivePeriod: {
        start: sleep.bedtime_start,
        end: sleep.bedtime_end
      }
    };

    // 5. Map remaining properties
    if (sleep.score !== undefined && sleep.score !== null) {
      observation.valueQuantity = {
        value: sleep.score,
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Sleep-Routes`,
        code: 'sleep_score'
      };
    }

    if (sleep.type) {
      observation.category = [
        {
          coding: [{ system: `${SYSTEMS.OURA_CUSTOM}#tag/Sleep-Routes`, code: sleep.type }]
        }
      ];
    }

    if (sleep.sleep_algorithm_version) {
      observation.method = { text: sleep.sleep_algorithm_version };
    }

    if (sleep.sleep_analysis_reason) {
      observation.note = [{ text: sleep.sleep_analysis_reason }];
    }

    if (sleep.ring_id) {
      observation.device = { reference: `Device/${sleep.ring_id}` };
    }

    if (extensions.length > 0) {
      observation.extension = extensions;
    }

    if (components.length > 0) {
      observation.component = components;
    }

    fhirObservations.push(observation);
  }
  return fhirObservations;
}
