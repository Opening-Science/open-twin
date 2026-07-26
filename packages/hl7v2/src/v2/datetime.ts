/**
 * HL7 v2 DTM to FHIR `dateTime` / `date` / `instant`.
 *
 * v2 DTM is `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]` (v2.5.1 §2.A.22). Every
 * component after the year is optional, and so is the offset.
 *
 * Two rules from the FHIR R4 `dateTime` definition drive everything here:
 *
 *   "If hours and minutes are specified, a time zone SHALL be populated."
 *   "Seconds must be provided due to schema type constraints but may be zero-filled
 *    and may be ignored at receiver discretion."
 *
 * So a v2 timestamp that carries a time but no offset **cannot** be expressed as a
 * FHIR dateTime at all. The tempting move is to append `Z`. That is a lie: it
 * asserts UTC for a local wall-clock time and shifts every result by the sender's
 * offset — up to fourteen hours, across a date boundary, which is exactly the class
 * of defect DECISIONS.md D7 records. This module narrows to the date instead and
 * reports that it did so. Precision is lost; no fact is invented.
 *
 * Zero-filling seconds is different: the FHIR specification explicitly sanctions it,
 * and the bounded error is under a minute rather than under a day.
 */

const DTM =
  /^(\d{4})(?:(\d{2})(?:(\d{2})(?:(\d{2})(?:(\d{2})(?:(\d{2}))?)?)?)?)?(\.\d{1,4})?(?:([+-])(\d{2})(\d{2}))?$/;

export type Precision = 'year' | 'month' | 'day' | 'second';

export interface V2DateTime {
  /** A FHIR `dateTime`. */
  readonly value: string;
  readonly precision: Precision;
  /** True when a time was present in the source but had to be dropped. */
  readonly narrowed: boolean;
  /** True when the offset was absent, which is why `narrowed` is set. */
  readonly missingOffset: boolean;
}

export type V2DateTimeResult = { readonly ok: true; readonly parsed: V2DateTime } | { readonly ok: false };

export function parseV2DateTime(raw: string | undefined): V2DateTimeResult {
  if (raw === undefined) return { ok: false };
  const match = DTM.exec(raw.trim());
  if (!match) return { ok: false };

  const [, year, month, day, hour, minute, second, fraction, sign, offsetHours, offsetMinutes] = match;

  const numbers = {
    month: month === undefined ? undefined : Number(month),
    day: day === undefined ? undefined : Number(day),
    hour: hour === undefined ? undefined : Number(hour),
    minute: minute === undefined ? undefined : Number(minute),
    second: second === undefined ? undefined : Number(second)
  };

  if (numbers.month !== undefined && (numbers.month < 1 || numbers.month > 12)) return { ok: false };
  if (numbers.day !== undefined && (numbers.day < 1 || numbers.day > 31)) return { ok: false };
  if (numbers.hour !== undefined && numbers.hour > 23) return { ok: false };
  if (numbers.minute !== undefined && numbers.minute > 59) return { ok: false };
  // 60 is a leap second, which FHIR's own dateTime regex permits.
  if (numbers.second !== undefined && numbers.second > 60) return { ok: false };

  // A fraction without seconds has nothing to be a fraction of.
  if (fraction !== undefined && numbers.second === undefined) return { ok: false };

  const hasOffset = sign !== undefined;
  if (hasOffset && !isRepresentableOffset(offsetHours as string, offsetMinutes as string)) return { ok: false };

  if (year === undefined) return { ok: false };
  if (month === undefined) return { ok: true, parsed: date(year, false, hasOffset, 'year') };
  if (day === undefined) return { ok: true, parsed: date(`${year}-${month}`, false, hasOffset, 'month') };

  const isoDate = `${year}-${month}-${day}`;

  // Hour precision alone is not enough: FHIR needs minutes, and zero-filling them
  // would assert a time that could be 59 minutes wrong. Only seconds may be
  // zero-filled, and only because the specification says so.
  if (hour === undefined || minute === undefined) {
    return { ok: true, parsed: date(isoDate, hour !== undefined, hasOffset, 'day') };
  }

  if (!hasOffset) {
    return {
      ok: true,
      parsed: { value: isoDate, precision: 'day', narrowed: true, missingOffset: true }
    };
  }

  const seconds = second ?? '00';
  const offset = `${sign}${offsetHours}:${offsetMinutes}`;
  return {
    ok: true,
    parsed: {
      value: `${isoDate}T${hour}:${minute}:${seconds}${fraction ?? ''}${offset}`,
      precision: 'second',
      narrowed: false,
      missingOffset: false
    }
  };
}

function date(value: string, hadTime: boolean, hasOffset: boolean, precision: Precision): V2DateTime {
  return { value, precision, narrowed: hadTime, missingOffset: hadTime && !hasOffset };
}

/**
 * FHIR's dateTime regex admits offsets from -14:00 to +14:00, and at 14 hours only
 * the whole hour. An offset outside that range is not expressible, and inventing a
 * clamped one would move the instant.
 */
function isRepresentableOffset(hours: string, minutes: string): boolean {
  const h = Number(hours);
  const m = Number(minutes);
  if (m > 59) return false;
  if (h < 14) return true;
  return h === 14 && m === 0;
}

/** A FHIR `date`: the calendar part only, whatever precision the source carried. */
export function v2Date(raw: string | undefined): string | undefined {
  const result = parseV2DateTime(raw);
  if (!result.ok) return undefined;
  const value = result.parsed.value;
  // `date` has no time component, so the offset is irrelevant and the calendar day
  // as written by the sender is the day they meant.
  return value.length > 10 ? value.slice(0, 10) : value;
}

/**
 * A FHIR `instant`, which requires full precision *and* an offset. Anything less
 * yields undefined rather than a fabricated one; `instant` is used for
 * `Bundle.timestamp` and `DiagnosticReport.issued`, both of which are moments.
 */
export function v2Instant(raw: string | undefined): string | undefined {
  const result = parseV2DateTime(raw);
  if (!result.ok || result.parsed.precision !== 'second') return undefined;
  return result.parsed.value;
}
