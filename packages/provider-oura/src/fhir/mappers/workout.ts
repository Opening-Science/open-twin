import type { Observation } from 'fhir/r4';
import type { OuraWorkoutList } from '../../api/schemas/workout';
import { SYSTEMS } from './shared';

export function mapOuraWorkoutToFHIR(ouraData: OuraWorkoutList): Observation[] {
  if (!ouraData?.data || ouraData.data.length === 0) {
    throw new Error('No workout data available to map to FHIR.');
  }

  const fhirObservations: Observation[] = [];

  for (const workout of ouraData.data) {
    const components: Observation['component'] = [];
    const extensions: Observation['extension'] = [];

    if (workout.calories !== null) {
      components.push({
        code: {
          coding: [
            {
              system: SYSTEMS.LOINC,
              code: '41979-6',
              display: 'Calories burned in 24 hours with moderate to vigorous activity'
            }
          ]
        },
        valueQuantity: {
          value: workout.calories,
          unit: 'kcal',
          system: SYSTEMS.UCUM,
          code: 'kcal'
        }
      });
    }

    if (workout.distance !== null) {
      components.push({
        code: {
          coding: [
            {
              system: `${SYSTEMS.OURA_CUSTOM}#tag/Workout-Routes`,
              code: 'workout-distance',
              display: 'Workout Distance'
            }
          ]
        },
        valueQuantity: {
          value: workout.distance,
          unit: 'm',
          system: SYSTEMS.UCUM,
          code: 'm'
        }
      });
    }

    extensions.push({
      url: `${SYSTEMS.OURA_CUSTOM}#tag/Workout-Routes`,
      valueString: workout.source
    });
    extensions.push({
      url: `${SYSTEMS.OURA_CUSTOM}#tag/Workout-Routes`,
      valueString: workout.intensity
    });
    extensions.push({
      url: `${SYSTEMS.OURA_CUSTOM}#tag/Workout-Routes`,
      valueString: workout.day
    });

    if (workout.label !== null) {
      extensions.push({
        url: `${SYSTEMS.OURA_CUSTOM}#tag/Workout-Routes`,
        valueString: workout.label
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
              code: 'activity',
              display: 'Activity'
            }
          ]
        }
      ],
      code: {
        coding: [
          {
            system: `${SYSTEMS.OURA_CUSTOM}#tag/Workout-Routes`,
            code: 'workout',
            display: 'Oura Workout'
          }
        ],
        text: workout.activity
      },
      subject: {
        reference: 'Patient/example'
      },
      identifier: [
        {
          system: `${SYSTEMS.OURA_CUSTOM}#tag/Workout-Routes`,
          value: workout.id
        }
      ],
      effectivePeriod: {
        start: workout.start_datetime,
        end: workout.end_datetime
      },
      extension: extensions
    };

    if (components.length > 0) {
      observation.component = components;
    }

    fhirObservations.push(observation);
  }

  return fhirObservations;
}
