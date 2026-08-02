/**
 * WHAT: Orchestrates fetch/parse/map (or map-only) into a FHIR Bundle result.
 * NOT:  Must not swallow partial failures; issues go to OperationOutcome (ADR 0006).
GOVERNED BY: DECISIONS.md#d5; DECISIONS.md#d6
 * CORRECTNESS: HL7 validator on emitted bundles in CI; terminology/unit gates on source codings.
 */
import {
  buildBundle,
  type ConnectorError,
  patientUuid,
  subjectReference,
  toOperationOutcome
} from '@open-twin/fhir-core';
import type { Bundle, FhirResource, OperationOutcome, Patient, Reference } from 'fhir/r4';
import { parseOrThrow } from '../api/parse';
import { SleepSessionPageSchema, WorkoutPageSchema } from '../api/schemas/events';
import { TimeSeriesPageSchema } from '../api/schemas/timeseries';
import { CONNECTOR, OPEN_WEARABLES_IDENTIFIER_SYSTEM } from '../config/constants';
import { IssueLog } from './issues';
import { DeviceRegistry } from './mappers/device';
import { mapSleepSession } from './mappers/sleep';
import { mapTimeSeriesSample, type SampleContext } from './mappers/timeseries';
import { mapWorkout } from './mappers/workout';

/**
 * One sync's worth of Open Wearables responses, exactly as the API returns them.
 *
 * Each field is `unknown` on purpose: these are untrusted response bodies and the
 * only thing that may look inside them is the zod schema. Typing them as parsed
 * shapes would let a caller hand in an object that type-checks and does not match
 * what the server sent.
 */
export interface OpenWearablesSync {
  /** The Open Wearables user id — a UUID, never an email address or other PII. */
  userId: string;
  /** Body of `GET /api/v1/users/{user_id}/timeseries`. */
  timeseries?: unknown;
  /** Body of `GET /api/v1/users/{user_id}/events/sleep`. */
  sleepSessions?: unknown;
  /** Body of `GET /api/v1/users/{user_id}/events/workouts`. */
  workouts?: unknown;
}

export interface BuildBundleOptions {
  /**
   * D1: used verbatim when supplied. When it is not, a deterministic `urn:uuid:`
   * reference is derived from the Open Wearables user id and a matching Patient is
   * added to the bundle, because this connector genuinely does not know who the
   * patient is and must not assert that it does.
   */
  subject?: Reference;
  /** ISO 8601. Supplied by the caller so bundles are reproducible. */
  timestamp: string;
  type?: 'collection' | 'transaction';
}

export interface BundleResult {
  bundle: Bundle;
  /** D6: present when anything was refused. Absent when everything mapped. */
  issues?: OperationOutcome;
}

/**
 * Accepts either the paginated envelope the API returns or a bare array of records,
 * so a caller who has already unwrapped `data` does not have to re-wrap it.
 */
function records(input: unknown): unknown {
  return Array.isArray(input) ? { data: input } : input;
}

/**
 * Maps one Open Wearables sync into one FHIR R4 bundle.
 *
 * D6: each section is mapped independently and a failure in one does not discard
 * the others. A section that fails to parse contributes an issue, not an exception,
 * because "sleep could not be parsed" and "there was no sleep in this window" are
 * different answers and a caller has to be able to tell them apart.
 */
export function buildOpenWearablesBundle(sync: OpenWearablesSync, options: BuildBundleOptions): BundleResult {
  const subject = subjectReference({ connector: CONNECTOR.connector, subjectKey: sync.userId });
  const issues = new IssueLog();
  const failures: ConnectorError[] = [];
  const devices = new DeviceRegistry(sync.userId);
  const context: SampleContext = { subject: options.subject ?? subject, subjectKey: sync.userId, devices, issues };

  const observations: FhirResource[] = [];

  if (sync.timeseries !== undefined) {
    try {
      const page = parseOrThrow(TimeSeriesPageSchema, records(sync.timeseries), 'GET users/{id}/timeseries');
      for (const sample of page.data) {
        const observation = mapTimeSeriesSample(sample, context);
        if (observation) observations.push(observation);
      }
    } catch (error) {
      failures.push(error as ConnectorError);
    }
  }

  if (sync.sleepSessions !== undefined) {
    try {
      const page = parseOrThrow(SleepSessionPageSchema, records(sync.sleepSessions), 'GET users/{id}/events/sleep');
      for (const session of page.data) observations.push(mapSleepSession(session, context));
    } catch (error) {
      failures.push(error as ConnectorError);
    }
  }

  if (sync.workouts !== undefined) {
    try {
      const page = parseOrThrow(WorkoutPageSchema, records(sync.workouts), 'GET users/{id}/events/workouts');
      for (const workout of page.data) observations.push(mapWorkout(workout, context));
    } catch (error) {
      failures.push(error as ConnectorError);
    }
  }

  const resources: FhirResource[] = [];
  if (!options.subject) {
    // D1: the Patient exists so the bundle is internally consistent. It asserts an
    // identifier and nothing else — no name, no birth date, no gender — because
    // the connector has none of those and inventing them is how a bundle ends up
    // attributed to whatever patient the receiver happens to have.
    const patient: Patient = {
      resourceType: 'Patient',
      id: patientUuid(CONNECTOR.connector, sync.userId),
      identifier: [{ system: OPEN_WEARABLES_IDENTIFIER_SYSTEM, value: sync.userId }]
    };
    resources.push(patient);
  }
  resources.push(...devices.devices(), ...observations);

  const bundle = buildBundle({
    connector: CONNECTOR,
    resources,
    timestamp: options.timestamp,
    bundleKey: `open-wearables|${sync.userId}|${options.timestamp}`,
    ...(options.type ? { type: options.type } : {})
  });

  const outcome = toOperationOutcome([...failures, ...issues.errors()]);
  return outcome ? { bundle, issues: outcome } : { bundle };
}
