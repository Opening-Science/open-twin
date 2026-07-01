import { describe, expect, it } from 'vitest';
import type { OuraWorkout, OuraWorkoutList } from '../../api/schemas/workout';
import { SYSTEMS } from '../../fhir/mappers/shared';
import { mapOuraWorkoutToFHIR } from '../../fhir/mappers/workout';

describe('mapOuraWorkoutToFHIR', () => {
  const baseWorkout: OuraWorkout = {
    id: 'workout-1',
    day: '2026-06-20',
    calories: 500,
    distance: 5,
    source: 'confirmed' as const,
    activity: 'running',
    end_datetime: '2026-06-20T08:30:00+00:00',
    start_datetime: '2026-06-20T08:00:00+00:00',
    intensity: 'moderate' as const,
    label: 'Morning Run'
  };

  it('throws an error when no workout data is provided', () => {
    expect(() => mapOuraWorkoutToFHIR(null as unknown as OuraWorkoutList)).toThrow(
      'No workout data available to map to FHIR.'
    );
  });

  it('throws an error when the response contains an empty data array', () => {
    const input: OuraWorkoutList = { data: [], next_token: null };

    expect(() => mapOuraWorkoutToFHIR(input)).toThrow('No workout data available to map to FHIR.');
  });

  it('maps a fully populated entry to a FHIR Observation resource', () => {
    const input: OuraWorkoutList = { data: [baseWorkout], next_token: null };

    const [observation] = mapOuraWorkoutToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [{ system: SYSTEMS.OBSERVATION_CATEGORY, code: 'activity', display: 'Activity' }]
        }
      ],
      code: {
        coding: [{ system: SYSTEMS.OURA_CUSTOM, code: 'workout', display: 'Oura Workout' }]
      },
      subject: { reference: 'Patient/example' },
      identifier: [{ system: `${SYSTEMS.OURA_CUSTOM}#tag/Workout-Routes`, value: 'workout-1' }],
      effectivePeriod: {
        start: '2026-06-20T08:00:00+00:00',
        end: '2026-06-20T08:30:00+00:00'
      }
    });
  });

  it('maps the calories and distance to components', () => {
    const input: OuraWorkoutList = { data: [baseWorkout], next_token: null };

    const [observation] = mapOuraWorkoutToFHIR(input);

    expect(observation.component).toHaveLength(2);
    expect(observation.component).toContainEqual({
      code: {
        coding: [
          {
            system: SYSTEMS.LOINC,
            code: '41981-2',
            display: 'Calories burned in 24 hours with moderate to vigorous activity'
          }
        ]
      },
      valueQuantity: { value: 500, unit: 'kcal', system: SYSTEMS.UCUM, code: 'kcal' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: SYSTEMS.OURA_CUSTOM, code: 'workout-distance', display: 'Workout Distance' }] },
      valueQuantity: { value: 5, unit: 'm', system: SYSTEMS.UCUM, code: 'm' }
    });
  });
});
