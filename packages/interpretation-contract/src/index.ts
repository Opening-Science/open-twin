/**
 * WHAT: Publishes the interpretation-contract.v0.2 schema, generated types, conformance validator, and confidence arithmetic.
 * NOT:  Does not invent interpretation rules or SystemId values.
 * GOVERNED BY: DECISIONS.md#d12; DECISIONS.md#d13; docs/contracts/interpretation-contract.v0.2.schema.json; docs/contracts/confidence.md
 * CORRECTNESS: Conformance via validateInterpretationDocument; confidence via docs/contracts/confidence.md
 */

export {
  ageDaysUtc,
  computeConfidence,
  decimalStringToRational,
  type Rational,
  rationalToFixed4,
  recencyFromAgeDays,
  roundHalfUp4
} from './confidence.js';
export type {
  Contributor,
  ContributorStatus,
  Geometry,
  InterpretiveAnatomySource,
  OpenTwinInterpretationDocumentV02,
  Severity,
  SystemId,
  SystemState,
  UnrenderableReason,
  UnrenderableState
} from './generated/interpretation-contract.v0.2.js';
export {
  type ConformanceError,
  type ConformanceErrorCode,
  type ConformanceResult,
  validateInterpretationDocument
} from './validate.js';

/** Nine SystemId values consumed from open-twin-openXR (D-f). */
export const SYSTEM_IDS = [
  'musculoskeletal',
  'cardiovascular',
  'nervous',
  'respiratory',
  'metabolic',
  'digestive',
  'endocrine',
  'integumentary',
  'reproductive'
] as const;

export const SCHEMA_VERSION = 'interpretation-contract.v0.2' as const;
export const INTENDED_USE = 'research_hypothesis_generation_n_of_1' as const;
