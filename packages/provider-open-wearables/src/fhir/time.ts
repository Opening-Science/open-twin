/**
 * WHAT: Open Wearables → FHIR mapping helpers.
 * NOT:  Must not perform HTTP; caller supplies normalised payloads.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: signed review record where codes are emitted; package fixtures are project-published (unverified against a live instance).
 * GOTCHA: Marked unverified against a running Open Wearables instance in BUILD-SUMMARY.
 */
import { ConnectorError } from '@open-twin/fhir-core';
import { CONNECTOR } from '../config/constants';

/**
 * Decision D7: `effective[x]` carries the subject's local UTC offset as supplied by
 * the vendor.
 *
 * Open Wearables stores `recorded_at` as an instant and `zone_offset` as a separate
 * string (backend/app/models/data_point_series.py; backend/app/utils/dates.py:30).
 * Re-serialising the instant with `toISOString()` would discard the offset and shift
 * every daily summary to the previous day for any wearer east of UTC — the exact
 * defect D7 was written for. So the instant is re-expressed *in* the offset: the
 * point in time is unchanged, the wall-clock reading is the subject's own.
 */
function pad(value: number, width = 2): string {
  return String(Math.abs(value)).padStart(width, '0');
}

/** Minutes to add to UTC. `+02:00` -> 120, `-05:30` -> -330. */
function offsetMinutes(zoneOffset: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(zoneOffset);
  if (!match) {
    // The offset itself is not patient data, but it arrives inside a patient
    // record, so it is not quoted either.
    throw new ConnectorError('Zone offset is not in the format +HH:MM', {
      code: 'validation',
      connector: CONNECTOR.connector,
      operation: 'zone offset'
    });
  }
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * (hours * 60 + minutes);
}

/**
 * A FHIR `dateTime` for the given instant, expressed in `zoneOffset`.
 *
 * Sub-second precision is preserved when the source carries it: two samples 200 ms
 * apart must not collapse onto the same `effectiveDateTime`, because a receiver
 * ordering a high-frequency heart-rate series by time would then reorder them
 * arbitrarily.
 */
export function fhirDateTime(instant: string, zoneOffset?: string | null): string {
  const epochMs = Date.parse(instant);
  if (Number.isNaN(epochMs)) {
    throw new ConnectorError('Timestamp is not a parseable ISO 8601 instant', {
      code: 'validation',
      connector: CONNECTOR.connector,
      operation: 'timestamp'
    });
  }

  const minutes = zoneOffset ? offsetMinutes(zoneOffset) : 0;
  const shifted = new Date(epochMs + minutes * 60_000);

  const date = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  const clock = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  const ms = shifted.getUTCMilliseconds();
  const fraction = ms === 0 ? '' : `.${pad(ms, 3)}`;

  // `Z` and `+00:00` denote the same offset in FHIR, so a zero offset — whether
  // supplied as `+00:00` or absent — is emitted as `Z`.
  if (minutes === 0) return `${date}T${clock}${fraction}Z`;
  const sign = minutes < 0 ? '-' : '+';
  return `${date}T${clock}${fraction}${sign}${pad(Math.trunc(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}
