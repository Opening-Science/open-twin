import type { Bundle } from 'fhir/r4';
import { buildOpenWearablesBundle } from '../fhir/bundleBuilder';
import { FIXTURE_USER_ID, SLEEP_PAGE, TIMESERIES_PAGE, WORKOUT_PAGE } from '../fixtures/openWearablesSync';

/**
 * The bundle handed to the HL7 validator in CI.
 *
 * Built by running the connector's own mappers over the fixtures, not by writing
 * FHIR by hand: a hand-written bundle validates the fixture, whereas this validates
 * the code. The timestamp is fixed so the bundle — and every id derived from it —
 * is byte-identical on every run.
 */
export function openWearablesBundle(): Bundle {
  return buildOpenWearablesBundle(
    {
      userId: FIXTURE_USER_ID,
      timeseries: TIMESERIES_PAGE,
      sleepSessions: SLEEP_PAGE,
      workouts: WORKOUT_PAGE
    },
    { timestamp: '2026-07-26T10:00:00Z' }
  ).bundle;
}
