/**
 * WHAT: Publishes the interpretation-contract.v0.2 schema, generated types, and conformance validator for openXR.
 * NOT:  Does not implement interpretation rules or scoring.
 * GOVERNED BY: DECISIONS.md#d12; DECISIONS.md#d13; docs/contracts/interpretation-contract.v0.2.schema.json
 * CORRECTNESS: Conformance via validateInterpretationDocument; reject fixtures under fixtures/reject/
 */

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
