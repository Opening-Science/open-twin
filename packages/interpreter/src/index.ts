/**
 * WHAT: Public API for the YAML rule-pack interpreter.
 * NOT:  No biomarker ids or named analytes in evaluate.ts (purity test); clinical cutoffs live in packages/interpreter/rules/. Freshness/confidence constants live in confidence.ts by design.
 * GOVERNED BY: docs/strategy/contracts/rules/rule-pack.v0.1.schema.json; docs/contracts/interpretation-contract.v0.2.schema.json
 * CORRECTNESS: Golden fixtures under packages/interpreter/fixtures/golden/; purity test forbids BM-* and named analytes in evaluate.ts (not "no thresholds" generally)
 */

export {
  ageDays,
  computeConfidence,
  recencyFactor,
  roundHalfUp4,
  STALE_AFTER_DAYS
} from './confidence.js';
export { evaluate, serializeDocument } from './evaluate.js';
export {
  defaultRulePackPath,
  type LoadRulePackOptions,
  loadRulePackFile,
  loadRulePackFromYaml,
  RulePackValidationError,
  validateRulePack
} from './load-rule-pack.js';
export type {
  BoundInterval,
  EvaluateInput,
  InputRole,
  InterpreterObservation,
  LadderStep,
  LadderWhen,
  Predicate,
  Rule,
  RuleCaps,
  RuleGeometry,
  RuleInput,
  RulePack
} from './types.js';
