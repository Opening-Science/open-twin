import { CATEGORY, createObservation, dataAbsentReason, deterministicId, quantity } from '@open-twin/fhir-core';
import type { Observation, Reference } from 'fhir/r4';
import type { TimeSeriesSample } from '../../api/schemas/timeseries';
import { CONNECTOR, OPEN_WEARABLES_IDENTIFIER_SYSTEM } from '../../config/constants';
import type { IssueLog } from '../issues';
import { SERIES_MAP, UNRESOLVED_SERIES } from '../seriesMap';
import { fhirDateTime } from '../time';
import type { DeviceRegistry } from './device';

export interface SampleContext {
  subject: Reference;
  /** The Open Wearables user id. Used only to derive stable resource ids (D2). */
  subjectKey: string;
  devices: DeviceRegistry;
  issues: IssueLog;
}

/**
 * The identity of a time-series sample.
 *
 * The API returns no id for a sample (`TimeSeriesSample` has no `id` field), so one
 * is derived from what does identify it: type, instant and originating source. The
 * source is part of the key because two providers can report a heart rate for the
 * same second, and collapsing them onto one id would silently drop one of the two
 * readings on every re-sync — the failure mode D2 exists to prevent.
 */
function sampleKey(sample: TimeSeriesSample): string {
  const provider = sample.source?.provider ?? '';
  const device = sample.source?.device ?? '';
  return ['timeseries', sample.type, sample.timestamp, provider, device].join('|');
}

/**
 * Maps one normalised sample. Returns undefined when the sample is refused, having
 * recorded why in the issue log.
 *
 * Refusal, not a best guess, is the whole design. The unit that arrives on the wire
 * is not trusted (see `seriesMap.ts`): if it is not one this connector has seen in
 * a primary source for that series type, the number's scale is unknown, and an
 * unknown scale published under a LOINC code is indistinguishable from a correct
 * reading.
 */
export function mapTimeSeriesSample(sample: TimeSeriesSample, context: SampleContext): Observation | undefined {
  const refusal = UNRESOLVED_SERIES[sample.type];
  if (refusal) {
    context.issues.add(
      `unresolved:${sample.type}`,
      'Series type is not mapped because its unit could not be established from a primary source',
      `${sample.type} (${refusal.reason}): ${refusal.detail}`
    );
    return undefined;
  }

  const mapping = SERIES_MAP[sample.type];
  if (!mapping) {
    context.issues.add(
      `unknown:${sample.type}`,
      'Series type is not known to this connector version',
      `${sample.type}: no entry in SERIES_MAP or UNRESOLVED_SERIES`
    );
    return undefined;
  }

  if (!mapping.acceptedUnits.includes(sample.unit)) {
    context.issues.add(
      `unit:${sample.type}:${sample.unit}`,
      'Sample carried a unit this connector has not seen in a primary source for that series type',
      `${sample.type}: expected one of [${mapping.acceptedUnits.join(', ')}], received "${sample.unit}"`
    );
    return undefined;
  }

  const isDailyTotal = sample.is_daily_total === true;
  const measure = isDailyTotal ? mapping.dailyTotal : mapping.sample;
  if (!measure) {
    context.issues.add(
      `daily:${sample.type}`,
      'Daily totals of this series type are not mapped',
      `${sample.type}: is_daily_total=true, but no 24-hour concept has been agreed for it`
    );
    return undefined;
  }

  const key = sampleKey(sample);
  const value = quantity(sample.value, measure.unit);
  const device = context.devices.reference(sample.source);

  return createObservation({
    id: deterministicId({
      connector: CONNECTOR.connector,
      subjectKey: context.subjectKey,
      recordId: key,
      measure: isDailyTotal ? 'daily-total' : 'sample'
    }),
    identifier: [{ system: OPEN_WEARABLES_IDENTIFIER_SYSTEM, value: key }],
    code: [...measure.codes],
    category: CATEGORY[measure.category],
    subject: context.subject,
    effectiveDateTime: fhirDateTime(sample.timestamp, sample.zone_offset),
    ...(value ? { valueQuantity: value } : { dataAbsentReason: dataAbsentReason() }),
    ...(measure.profiles ? { profiles: [...measure.profiles] } : {}),
    ...(device ? { device } : {})
  });
}
