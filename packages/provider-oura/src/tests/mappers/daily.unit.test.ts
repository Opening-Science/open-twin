import { describe, expect, it } from 'vitest';
import type { OuraDailyActivityItem, OuraDailyActivityResponseList } from '../../api/schemas/daily';
import { mapOuraDailyActivityToFHIR } from '../../fhir/mappers/daily';

describe('mapOuraDailyActivityToFHIR', () => {
  const baseActivity: OuraDailyActivityItem = {
    id: 'activity-1',
    day: '2026-06-20',
    timestamp: '2026-06-20T04:00:00+00:00',
    score: 85,
    active_calories: 400,
    total_calories: 2500,
    target_calories: 350,
    steps: 9000,
    contributors: {
      meet_daily_targets: 90,
      move_every_hour: 80
    }
  };

  it('maps an activity entry to a FHIR Observation resource', () => {
    const input: OuraDailyActivityResponseList = { data: [baseActivity], next_token: null };

    const [observation] = mapOuraDailyActivityToFHIR(input);

    expect(observation).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      identifier: [{ system: 'https://cloud.ouraring.com/v2/docs', value: 'oura-activity-activity-1' }],
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'activity',
              display: 'Activity'
            }
          ]
        }
      ],
      code: {
        coding: [
          { system: 'https://cloud.ouraring.com/v2/docs', code: 'activity-score', display: 'Oura Activity Score' }
        ]
      }
    });
  });

  it('sets the root valueQuantity from the activity score', () => {
    const input: OuraDailyActivityResponseList = { data: [baseActivity], next_token: null };

    const [observation] = mapOuraDailyActivityToFHIR(input);

    expect(observation.valueQuantity).toEqual({
      value: 85,
      unit: 'score',
      system: 'http://unitsofmeasure.org',
      code: '{score}'
    });
  });

  it('defaults the root valueQuantity to 0 when score is missing', () => {
    const { score: _score, ...withoutScore } = baseActivity;
    const input: OuraDailyActivityResponseList = { data: [withoutScore], next_token: null };

    const [observation] = mapOuraDailyActivityToFHIR(input);

    expect(observation.valueQuantity?.value).toBe(0);
  });

  it('converts the timestamp to an ISO effectiveDateTime', () => {
    const input: OuraDailyActivityResponseList = { data: [baseActivity], next_token: null };

    const [observation] = mapOuraDailyActivityToFHIR(input);

    expect(observation.effectiveDateTime).toBe('2026-06-20T04:00:00.000Z');
  });

  it('uses the provided patientId in the subject reference', () => {
    const input: OuraDailyActivityResponseList = { data: [baseActivity], next_token: null };

    const [observation] = mapOuraDailyActivityToFHIR(input, 'patient-42');

    expect(observation.subject?.reference).toBe('Patient/patient-42');
  });

  it("defaults the subject reference to 'Patient/unknown' when no patientId is given", () => {
    const input: OuraDailyActivityResponseList = { data: [baseActivity], next_token: null };

    const [observation] = mapOuraDailyActivityToFHIR(input);

    expect(observation.subject?.reference).toBe('Patient/unknown');
  });

  it('maps populated metrics and contributors into components', () => {
    const input: OuraDailyActivityResponseList = { data: [baseActivity], next_token: null };

    const [observation] = mapOuraDailyActivityToFHIR(input);

    expect(observation.component).toContainEqual({
      code: { coding: [{ system: 'http://loinc.org', code: '41950-7', display: 'Number of steps in 24 hours' }] },
      valueQuantity: { value: 9000, unit: 'steps', system: 'http://unitsofmeasure.org', code: 'steps' }
    });
    expect(observation.component).toContainEqual({
      code: { coding: [{ system: 'http://loinc.org', code: '41979-6', display: 'Calories burned in 24 hours' }] },
      valueQuantity: { value: 2500, unit: 'kcal', system: 'http://unitsofmeasure.org', code: 'kcal' }
    });
    expect(observation.component).toContainEqual({
      code: {
        coding: [
          { system: 'https://cloud.ouraring.com/v2/docs', code: 'meet-daily-targets', display: 'Meet Daily Targets' }
        ]
      },
      valueQuantity: { value: 90, unit: 'score', system: 'http://unitsofmeasure.org', code: '{score}' }
    });
  });

  it('omits components for metrics that are not present', () => {
    const minimalActivity = {
      id: 'activity-min',
      day: '2026-06-21',
      timestamp: '2026-06-21T04:00:00+00:00',
      contributors: {}
    };
    const input: OuraDailyActivityResponseList = { data: [minimalActivity], next_token: null };

    const [observation] = mapOuraDailyActivityToFHIR(input);

    expect(observation.component).toBeUndefined();
  });

  it('maps every entry in the list preserving order', () => {
    const input: OuraDailyActivityResponseList = {
      data: [
        { ...baseActivity, id: 'activity-1' },
        { ...baseActivity, id: 'activity-2' }
      ],
      next_token: null
    };

    const observations = mapOuraDailyActivityToFHIR(input);

    expect(observations).toHaveLength(2);
    expect(observations[0].identifier?.[0].value).toBe('oura-activity-activity-1');
    expect(observations[1].identifier?.[0].value).toBe('oura-activity-activity-2');
  });

  it('returns an empty array when the response contains no data', () => {
    const input: OuraDailyActivityResponseList = { data: [], next_token: null };

    expect(mapOuraDailyActivityToFHIR(input)).toEqual([]);
  });
});
