import type { Observation } from 'fhir/r4';
import type { OuraReadinessResponseList } from '../../api/schemas/readiness';
import { SYSTEMS } from './shared';

export function mapOuraReadinessToFHIR(ouraData: OuraReadinessResponseList): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No readiness data available to map to FHIR.');
  }

  return ouraData.data.map((readiness) => {
    const components: Observation['component'] = [];

    const addComponent = (
      value: number | null | undefined,
      coding: { system: string; code: string; display: string },
      unit: string,
      code: string
    ) => {
      if (value === undefined || value === null) return;
      components.push({
        code: { coding: [coding] },
        valueQuantity: { value, unit, system: SYSTEMS.UCUM, code }
      });
    };

    addComponent(
      readiness.contributors.activity_balance,
      {
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`,
        code: 'activity-balance',
        display: 'Activity Balance'
      },
      'Score',
      '{score}'
    );
    addComponent(
      readiness.contributors.hrv_balance,
      { system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`, code: 'hrv-balance', display: 'HRV Balance' },
      'Score',
      '{score}'
    );
    addComponent(
      readiness.contributors.previous_day_activity,
      {
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`,
        code: 'previous-day-activity',
        display: 'Previous Day Activity'
      },
      'Score',
      '{score}'
    );
    addComponent(
      readiness.contributors.previous_night,
      {
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`,
        code: 'previous-night',
        display: 'Previous Night'
      },
      'Score',
      '{score}'
    );
    addComponent(
      readiness.contributors.recovery_index,
      {
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`,
        code: 'recovery-index',
        display: 'Recovery Index'
      },
      'Score',
      '{score}'
    );
    addComponent(
      readiness.contributors.resting_heart_rate,
      {
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`,
        code: 'resting-heart-rate',
        display: 'Resting Heart Rate'
      },
      'Score',
      '{score}'
    );
    addComponent(
      readiness.contributors.sleep_balance,
      { system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`, code: 'sleep-balance', display: 'Sleep Balance' },
      'Score',
      '{score}'
    );
    addComponent(
      readiness.contributors.sleep_regularity,
      {
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`,
        code: 'sleep-regularity',
        display: 'Sleep Regularity'
      },
      'Score',
      '{score}'
    );

    addComponent(
      readiness.temperature_deviation,
      {
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`,
        code: 'temperature-deviation',
        display: 'Temperature Deviation'
      },
      '°C',
      'Cel'
    );
    addComponent(
      readiness.temperature_trend_deviation,
      {
        system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`,
        code: 'temperature-trend-deviation',
        display: 'Temperature Trend Deviation'
      },
      '°C',
      'Cel'
    );

    const observation: Observation = {
      resourceType: 'Observation',
      identifier: [
        {
          system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`,
          value: `oura-readiness-${readiness.id}`
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
            system: `${SYSTEMS.OURA_CUSTOM}#tag/Daily-Readiness-Routes`,
            code: 'readiness-score',
            display: 'Oura Readiness Score'
          }
        ]
      },
      subject: {
        reference: 'Patient/example'
      },
      effectiveDateTime: new Date(readiness.timestamp).toISOString(),
      component: components.length > 0 ? components : undefined
    };

    if (readiness.score !== undefined && readiness.score !== null) {
      observation.valueQuantity = {
        value: readiness.score,
        unit: 'Score',
        system: SYSTEMS.UCUM,
        code: '{score}'
      };
    } else {
      observation.dataAbsentReason = {
        coding: [
          {
            system: SYSTEMS.DATA_ABSENT,
            code: 'unknown',
            display: 'Unknown'
          }
        ]
      };
    }

    return observation;
  });
}
