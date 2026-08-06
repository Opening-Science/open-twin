/**
 * WHAT: Collection-event context that must reach the interpreter (sex, age, cycle, TOD, fasting).
 * NOT:  Does not select reference-interval populations — that is interpretation, not lookup.
 * GOVERNED BY: docs/contracts/interpretation-contract.v0.2.schema.json; DECISIONS.md#d12
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
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

const FHIR_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** FHIR dateTime with mandatory offset (Z or ±HH:MM) — collection time is timezone-sensitive. */
const FHIR_DATETIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function assertValidCollectionContext(ctx: CollectionContext): void {
  if (!FHIR_DATE.test(ctx.birthDate)) {
    throw new Error('CollectionContext.birthDate must be a FHIR date (YYYY-MM-DD)');
  }
  if (!FHIR_DATETIME_WITH_OFFSET.test(ctx.effectiveDateTime)) {
    throw new Error('CollectionContext.effectiveDateTime must be a FHIR dateTime with timezone offset');
  }
}
