/**
 * WHAT: Collection-event context that must reach the interpreter (sex, age, cycle, TOD, fasting).
 * NOT:  Does not select reference-interval populations — that is interpretation, not lookup.
 * GOVERNED BY: docs/contracts/interpretation-contract.v0.2.schema.json; DECISIONS.md#d12
 * CORRECTNESS: FHIR R4 date / dateTime (calendar + offset bounds); NONE for population semantics — see docs/findings/no-external-authority.md
 * GOTCHA: Cortisol cannot be flagged without collection time; Östradiol cannot without cycle phase. Carry both here.
 */
/** Menstrual cycle phase as used in Anchor interval populations (e.g. female_Follikelphase). */
export type MenstrualCyclePhase = 'follicular' | 'midcycle' | 'luteal' | 'postmenopausal' | 'unknown';

/**
 * Laboratory time-of-day windows from German catalogues (cortisol: vor_10h / nach_17h).
 * Prefer deriving from effectiveDateTime; the explicit window documents the lab's question.
 */
export type TimeOfDayWindow = 'vor_10h' | 'nach_17h' | 'unspecified';

export type AdministrativeGender = 'male' | 'female' | 'other' | 'unknown';

/**
 * Everything about the draw that the interpreter needs to choose a population.
 * Population selection itself is NOT performed here.
 *
 * Subject identity is always derived from `subjectKey` (D1/D2). Do not pass an
 * external Patient reference — the Bundle Patient and Observation.subject must agree.
 */
export interface CollectionContext {
  /** Stable subject key for deterministic ids (D1/D2). */
  subjectKey: string;
  /** Administrative sex — required for sex-stratified intervals at interpretation time. */
  sex: AdministrativeGender;
  /** ISO date YYYY-MM-DD — required for age-band intervals at interpretation time. */
  birthDate: string;
  /**
   * Instant of specimen collection with timezone.
   * Cortisol vor_10h / nach_17h cannot be decided without this.
   */
  effectiveDateTime: string;
  /** Collection event id — one Bundle per event. */
  collectionEventId: string;
  /** Cycle phase when known; null/omitted means the interpreter cannot use cycle-stratified intervals. */
  menstrualCyclePhase?: MenstrualCyclePhase | null;
  /** Fasting state when known. */
  fasting?: boolean | null;
  /**
   * Explicit catalogue window when the lab labelled the draw that way.
   * When omitted, interpreters may derive from effectiveDateTime.
   */
  timeOfDayWindow?: TimeOfDayWindow | null;
  /** Laboratory / analyser device key. */
  deviceKey?: string;
  deviceManufacturer?: string;
  deviceModel?: string;
}

/** Foundation complex extension so cycle / fasting / TOD travel with the Observation. */
export const COLLECTION_CONTEXT_EXTENSION = 'http://opentwin.ch/fhir/StructureDefinition/collection-context';

/** Short slice urls nested under COLLECTION_CONTEXT_EXTENSION (house IG pattern). */
export const EXT_CYCLE_PHASE = 'menstrual-cycle-phase';
export const EXT_FASTING = 'fasting';
export const EXT_TOD_WINDOW = 'time-of-day-window';

const FHIR_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** FHIR dateTime with mandatory offset (Z or ±HH:MM) — collection time is timezone-sensitive. */
const FHIR_DATETIME_SHAPE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Calendar-aware FHIR date: year 1–9999, real month/day (incl. leap days). */
function isValidFhirCalendarDate(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  // FHIR date inherits XML Schema: year 0000 is not a valid Gregorian year.
  if (y < 1 || y > 9999) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1) return false;
  const maxDay = m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m];
  return d <= maxDay;
}

/**
 * FHIR R4 dateTime offsets are −14:00..+14:00; at ±14 only the whole hour is allowed.
 * See also packages/hl7v2/src/v2/datetime.ts isRepresentableOffset.
 */
function isRepresentableOffset(hours: string, minutes: string): boolean {
  const h = Number(hours);
  const m = Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return false;
  if (m < 0 || m > 59) return false;
  if (h < 14) return true;
  return h === 14 && m === 0;
}

export function isValidFhirDate(value: string): boolean {
  const match = FHIR_DATE_SHAPE.exec(value);
  if (!match) return false;
  return isValidFhirCalendarDate(match[1], match[2], match[3]);
}

export function isValidFhirDateTimeWithOffset(value: string): boolean {
  const match = FHIR_DATETIME_SHAPE.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, , zone, , offsetHours, offsetMinutes] = match;
  if (!isValidFhirCalendarDate(year, month, day)) return false;
  const h = Number(hour);
  const min = Number(minute);
  const sec = Number(second);
  // FHIR disallows 24:00; leap seconds may be 60.
  if (h > 23 || min > 59 || sec > 60) return false;
  if (zone === 'Z') return true;
  return isRepresentableOffset(offsetHours, offsetMinutes);
}

export function assertValidCollectionContext(ctx: CollectionContext): void {
  if (!isValidFhirDate(ctx.birthDate)) {
    throw new Error('CollectionContext.birthDate must be a valid FHIR date (YYYY-MM-DD)');
  }
  if (!isValidFhirDateTimeWithOffset(ctx.effectiveDateTime)) {
    throw new Error('CollectionContext.effectiveDateTime must be a valid FHIR dateTime with timezone offset');
  }
}
