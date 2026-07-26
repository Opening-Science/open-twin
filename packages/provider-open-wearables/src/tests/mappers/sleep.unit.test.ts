import { SYSTEMS } from '@open-twin/fhir-core';
import type { Observation, Reference } from 'fhir/r4';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SleepSession } from '../../api/schemas/events';
import { IssueLog } from '../../fhir/issues';
import { DeviceRegistry } from '../../fhir/mappers/device';
import { mapSleepSession } from '../../fhir/mappers/sleep';
import type { SampleContext } from '../../fhir/mappers/timeseries';

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

function session(overrides: Partial<SleepSession> = {}): SleepSession {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    start_time: '2024-01-01T22:00:00+00:00',
    end_time: '2024-01-02T06:30:00+00:00',
    zone_offset: '+00:00',
    duration_seconds: 30600,
    source: { provider: 'oura', device: 'Oura Ring Gen3' },
    efficiency_percent: 88.5,
    stages: { awake_minutes: 12, light_minutes: 210, deep_minutes: 90, rem_minutes: 95 },
    is_nap: false,
    ...overrides
  };
}

function component(observation: Observation, code: string) {
  return observation.component?.find((entry) => entry.code.coding?.[0]?.code === code);
}

describe('mapSleepSession', () => {
  it('converts seconds to minutes before publishing under a minutes-bound LOINC code', () => {
    // Open Wearables reports seconds; LOINC 93832-4 is bound to `min` by D4.
    // 27000 s published verbatim under `min` claims 18.75 days of sleep.
    const observation = mapSleepSession(session({ sleep_duration_seconds: 27000 }), context);
    expect(observation.valueQuantity).toEqual({
      value: 450,
      unit: 'minutes',
      system: SYSTEMS.UCUM,
      code: 'min'
    });
  });

  it('does not let binary floating point turn a duration into false precision', () => {
    const observation = mapSleepSession(session({ sleep_duration_seconds: 30601 }), context);
    expect(observation.valueQuantity?.value).toBe(510.017);
  });

  it('publishes dataAbsentReason, not zero and not time in bed, when sleep duration is missing', () => {
    // The platform's own example sleep payload omits sleep_duration_seconds while
    // supplying duration_seconds. Substituting one for the other publishes time in
    // bed as time asleep; substituting zero publishes a night of no sleep.
    const observation = mapSleepSession(session({ sleep_duration_seconds: null }), context);
    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.dataAbsentReason?.coding?.[0]?.code).toBe('unknown');
    // 510 min is the session length. It is published, but under its own code —
    // never promoted into the sleep-duration slot the provider left empty.
    expect(component(observation, 'sleep-session-duration')?.valueQuantity?.value).toBe(510);
  });

  it('maps the three stage durations to their LOINC codes in minutes', () => {
    const observation = mapSleepSession(session(), context);
    expect(component(observation, '93831-6')?.valueQuantity).toEqual({
      value: 90,
      unit: 'minutes',
      system: SYSTEMS.UCUM,
      code: 'min'
    });
    expect(component(observation, '93830-8')?.valueQuantity?.value).toBe(210);
    expect(component(observation, '93829-0')?.valueQuantity?.value).toBe(95);
  });

  it('keeps a reported-but-null stage as dataAbsentReason rather than dropping or zeroing it', () => {
    const observation = mapSleepSession(
      session({ stages: { awake_minutes: 12, light_minutes: 210, deep_minutes: null, rem_minutes: 95 } }),
      context
    );
    const deep = component(observation, '93831-6');
    expect(deep).toBeDefined();
    expect(deep?.valueQuantity).toBeUndefined();
    expect(deep?.dataAbsentReason?.coding?.[0]?.code).toBe('unknown');
  });

  it('omits the stage components entirely when the provider reported no stages', () => {
    // "No stage breakdown from this provider" and "a stage breakdown with unknown
    // values" are different statements about the data.
    const observation = mapSleepSession(session({ stages: null }), context);
    expect(component(observation, '93831-6')).toBeUndefined();
  });

  it('publishes sleep efficiency under a vendor-local code, never under a duration concept', () => {
    const efficiency = component(mapSleepSession(session(), context), 'sleep-efficiency');
    expect(efficiency?.code.coding?.[0]?.system).toBe('http://opentwin.ch/fhir/CodeSystem/open-wearables');
    expect(efficiency?.valueQuantity).toEqual({ value: 88.5, unit: '%', system: SYSTEMS.UCUM, code: '%' });
  });

  it('distinguishes a nap from a night by a code, not by free text', () => {
    const nap = component(mapSleepSession(session({ is_nap: true }), context), 'sleep-session-kind');
    const night = component(mapSleepSession(session({ is_nap: false }), context), 'sleep-session-kind');
    expect(nap?.valueCodeableConcept?.coding?.[0]?.code).toBe('nap');
    expect(night?.valueCodeableConcept?.coding?.[0]?.code).toBe('main-sleep');
  });

  it('spans the session with an effectivePeriod in the subject local offset', () => {
    const observation = mapSleepSession(session({ zone_offset: '+02:00' }), context);
    expect(observation.effectivePeriod).toEqual({
      start: '2024-01-02T00:00:00+02:00',
      end: '2024-01-02T08:30:00+02:00'
    });
    expect(observation.effectiveDateTime).toBeUndefined();
  });

  it('derives its id from the platform record id, so a re-sync updates rather than duplicates', () => {
    expect(mapSleepSession(session(), context).id).toBe(mapSleepSession(session(), context).id);
    expect(mapSleepSession(session(), context).id).not.toBe(
      mapSleepSession(session({ id: '00000000-0000-0000-0000-0000000000ff' }), context).id
    );
  });
});
