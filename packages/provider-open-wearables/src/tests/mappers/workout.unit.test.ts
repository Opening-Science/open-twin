import { SYSTEMS } from '@open-twin/fhir-core';
import type { Observation, Reference } from 'fhir/r4';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Workout } from '../../api/schemas/events';
import { IssueLog } from '../../fhir/issues';
import { DeviceRegistry } from '../../fhir/mappers/device';
import type { SampleContext } from '../../fhir/mappers/timeseries';
import { mapWorkout } from '../../fhir/mappers/workout';

const SUBJECT: Reference = { reference: 'Patient/subject-under-test' };
const SUBJECT_KEY = '00000000-0000-0000-0000-000000000002';

let context: SampleContext;

beforeEach(() => {
  context = {
    subject: SUBJECT,
    subjectKey: SUBJECT_KEY,
    devices: new DeviceRegistry(SUBJECT_KEY),
    issues: new IssueLog()
  };
});

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    type: 'running',
    start_time: '2024-01-01T08:00:00+00:00',
    end_time: '2024-01-01T09:00:00+00:00',
    zone_offset: '+00:00',
    duration_seconds: 3600,
    source: { provider: 'garmin', device: 'Garmin Fenix 7' },
    calories_kcal: 450,
    distance_meters: 8500,
    avg_heart_rate_bpm: 155,
    max_heart_rate_bpm: 178,
    avg_pace_sec_per_km: 424,
    elevation_gain_meters: 120,
    ...overrides
  };
}

function component(observation: Observation, code: string) {
  return observation.component?.find((entry) => entry.code.coding?.[0]?.code === code);
}

describe('mapWorkout', () => {
  it('converts the workout duration from seconds to the minutes LOINC 55411-3 requires', () => {
    const observation = mapWorkout(workout(), context);
    expect(observation.code.coding?.[0]?.code).toBe('55411-3');
    expect(observation.valueQuantity).toEqual({
      value: 60,
      unit: 'minute',
      system: SYSTEMS.UCUM,
      code: 'min'
    });
  });

  it('publishes calories under the point-in-time code, not the 24-hour one', () => {
    // LOINC 41979-6 "Calories burned in 24 hour" would claim a whole day's total
    // for a one-hour run.
    const calories = component(mapWorkout(workout(), context), '41981-2');
    expect(calories?.valueQuantity).toEqual({ value: 450, unit: 'kilocalorie', system: SYSTEMS.UCUM, code: 'kcal' });
  });

  it('does not publish an average heart rate under the point-in-time LOINC heart rate code', () => {
    // An average over an hour is a different property from an instantaneous
    // reading. Emitting both under 8867-4 makes them indistinguishable, which is
    // the defect class that merged VO2max with a run-derived estimate here before.
    const observation = mapWorkout(workout(), context);
    expect(component(observation, '8867-4')).toBeUndefined();
    expect(component(observation, '8873-2')).toBeUndefined();
    const average = component(observation, 'workout-heart-rate-average');
    expect(average?.code.coding?.[0]?.system).toBe('http://opentwin.ch/fhir/CodeSystem/open-wearables');
    expect(average?.valueQuantity).toEqual({ value: 155, unit: 'per minute', system: SYSTEMS.UCUM, code: '/min' });
    expect(component(observation, 'workout-heart-rate-maximum')?.valueQuantity?.value).toBe(178);
  });

  it('carries distance and elevation in metres', () => {
    const observation = mapWorkout(workout(), context);
    expect(component(observation, 'workout-distance')?.valueQuantity).toEqual({
      value: 8500,
      unit: 'meter',
      system: SYSTEMS.UCUM,
      code: 'm'
    });
    expect(component(observation, 'workout-elevation-gain')?.valueQuantity?.value).toBe(120);
  });

  it('records that average pace was dropped instead of dropping it silently', () => {
    mapWorkout(workout(), context);
    const diagnostics = context.issues.errors().map((issue) => issue.toString());
    expect(diagnostics.some((entry) => entry.includes('avg_pace_sec_per_km'))).toBe(true);
  });

  it('raises no issue when the workout carried no pace', () => {
    mapWorkout(workout({ avg_pace_sec_per_km: null }), context);
    expect(context.issues.errors()).toHaveLength(0);
  });

  it('carries the normalised workout type as a code, not as free text', () => {
    const type = component(mapWorkout(workout({ type: 'open_water_swimming' }), context), 'workout-type');
    expect(type?.valueCodeableConcept?.coding?.[0]).toEqual({
      system: 'http://opentwin.ch/fhir/CodeSystem/open-wearables',
      code: 'open_water_swimming'
    });
    expect(type?.valueString).toBeUndefined();
  });

  it('omits absent aggregates rather than publishing them as zero', () => {
    const observation = mapWorkout(
      workout({ calories_kcal: null, distance_meters: null, elevation_gain_meters: null }),
      context
    );
    expect(component(observation, '41981-2')).toBeUndefined();
    expect(component(observation, 'workout-distance')).toBeUndefined();
    expect(JSON.stringify(observation)).not.toContain('"value":0');
  });

  it('emits dataAbsentReason when the platform reported no duration', () => {
    const observation = mapWorkout(workout({ duration_seconds: null }), context);
    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.dataAbsentReason?.coding?.[0]?.code).toBe('unknown');
  });
});
