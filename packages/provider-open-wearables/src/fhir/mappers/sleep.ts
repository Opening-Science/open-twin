import {
  CATEGORY,
  codeableComponent,
  createObservation,
  dataAbsentReason,
  deterministicId,
  numericComponent,
  optionalNumericComponent,
  quantity,
  SYSTEMS,
  UCUM
} from '@open-twin/fhir-core';
import type { Observation } from 'fhir/r4';
import type { SleepSession } from '../../api/schemas/events';
import { CONNECTOR, OPEN_WEARABLES_IDENTIFIER_SYSTEM, OPEN_WEARABLES_SYSTEM } from '../../config/constants';
import { loincUnit } from '../seriesMap';
import { fhirDateTime } from '../time';
import type { SampleContext } from './timeseries';

/**
 * Seconds to minutes.
 *
 * Open Wearables reports sleep session durations in seconds
 * (`SleepSession.duration_seconds`, `.sleep_duration_seconds`) while the LOINC
 * sleep codes are bound to `min` by D4. Publishing 30600 under LOINC 93832-4 with
 * unit `min` claims 21 days of sleep; this repository has already shipped that
 * exact defect once, as raw seconds under a minutes-coded LOINC concept.
 *
 * Rounded to milliminutes to keep binary floating point from turning 30601 s into
 * 510.01666666666665 min, which is noise dressed up as precision.
 */
function secondsToMinutes(seconds: number | null | undefined): number | undefined {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds)) return undefined;
  return Math.round((seconds / 60) * 1000) / 1000;
}

const AWAKE = { system: OPEN_WEARABLES_SYSTEM, code: 'sleep-awake-duration', display: 'Awake duration during sleep' };
const EFFICIENCY = { system: OPEN_WEARABLES_SYSTEM, code: 'sleep-efficiency', display: 'Sleep efficiency' };
const SESSION_DURATION = {
  system: OPEN_WEARABLES_SYSTEM,
  code: 'sleep-session-duration',
  display: 'Sleep session duration'
};
const SESSION_KIND = { system: OPEN_WEARABLES_SYSTEM, code: 'sleep-session-kind', display: 'Sleep session kind' };

/**
 * One sleep session becomes one Observation with the stage breakdown as components.
 *
 * The session's own `duration_seconds` is *not* published under LOINC 103213-5
 * "Duration in bed". `SleepDetails` has a distinct `sleep_time_in_bed_minutes`
 * column (backend/app/models/sleep_details.py:29) that the `SleepSession` response
 * does not expose, so `duration_seconds` is the event's wall-clock length and
 * equating the two would be an inference, not a mapping. It goes out under a
 * vendor-local code instead.
 *
 * TODO(clinical-review): sleep efficiency has no standard concept in LOINC or
 * SNOMED CT that this project has been able to verify — the repository has already
 * rejected SNOMED 248263006 (Duration of sleep) for it — so it is vendor-local with
 * unit `%`. Confirm or supply a standard code.
 */
export function mapSleepSession(session: SleepSession, context: SampleContext): Observation {
  const totalSleepMinutes = secondsToMinutes(session.sleep_duration_seconds);
  const value = quantity(totalSleepMinutes, loincUnit('93832-4'));
  const device = context.devices.reference(session.source);
  const stages = session.stages;

  return createObservation({
    id: deterministicId({
      connector: CONNECTOR.connector,
      subjectKey: context.subjectKey,
      recordId: session.id,
      measure: 'sleep'
    }),
    identifier: [{ system: OPEN_WEARABLES_IDENTIFIER_SYSTEM, value: `sleep|${session.id}` }],
    code: { system: SYSTEMS.LOINC, code: '93832-4', display: 'Sleep duration' },
    category: CATEGORY.ACTIVITY,
    subject: context.subject,
    effectivePeriod: {
      start: fhirDateTime(session.start_time, session.zone_offset),
      end: fhirDateTime(session.end_time, session.zone_offset)
    },
    ...(value ? { valueQuantity: value } : { dataAbsentReason: dataAbsentReason() }),
    components: [
      // The stage components are emitted whenever the `stages` object is present,
      // carrying dataAbsentReason for any stage the provider left null. A provider
      // that reports stages but not REM is saying something different from a
      // provider that reports no stages at all, and zero would say neither.
      ...(stages
        ? [
            numericComponent(
              { system: SYSTEMS.LOINC, code: '93831-6', display: 'Deep sleep duration' },
              stages.deep_minutes,
              loincUnit('93831-6')
            ),
            numericComponent(
              { system: SYSTEMS.LOINC, code: '93830-8', display: 'Light sleep duration' },
              stages.light_minutes,
              loincUnit('93830-8')
            ),
            numericComponent(
              { system: SYSTEMS.LOINC, code: '93829-0', display: 'REM sleep duration' },
              stages.rem_minutes,
              loincUnit('93829-0')
            ),
            // TODO(clinical-review): no verified LOINC concept for time awake
            // within a sleep period. Vendor-local, in the same unit as its siblings.
            numericComponent(AWAKE, stages.awake_minutes, UCUM.MINUTE)
          ]
        : []),
      optionalNumericComponent(SESSION_DURATION, secondsToMinutes(session.duration_seconds), UCUM.MINUTE),
      optionalNumericComponent(EFFICIENCY, session.efficiency_percent, UCUM.PERCENT),
      // A nap and a night's sleep are different assertions and the difference is
      // categorical, so it is a coded value rather than free text.
      codeableComponent(SESSION_KIND, {
        system: OPEN_WEARABLES_SYSTEM,
        code: session.is_nap === true ? 'nap' : 'main-sleep',
        display: session.is_nap === true ? 'Nap' : 'Main sleep'
      })
    ],
    ...(device ? { device } : {})
  });
}
