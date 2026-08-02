/**
 * WHAT: Public API for the pure YAML rule-pack interpreter.
 * NOT:  Does not contain clinical knowledge — rules live in packages/interpreter/rules/.
 * GOVERNED BY: docs/strategy/contracts/rules/rule-pack.v0.1.schema.json; docs/contracts/interpretation-contract.v0.2.schema.json
 * CORRECTNESS: Golden fixtures under packages/interpreter/fixtures/golden/
 */

export { evaluate, serializeDocument } from './evaluate.js';
export {
  computeConfidence,
  recencyFactor,
  ageDays,
  roundHalfUp4,
  STALE_AFTER_DAYS,
} from './confidence.js';
export {
  loadRulePackFile,
  loadRulePackFromYaml,
  validateRulePack,
  defaultRulePackPath,
  RulePackValidationError,
  type LoadRulePackOptions,
} from './load-rule-pack.js';
export type {
  RulePack,
  Rule,
  RuleInput,
  LadderStep,
  LadderWhen,
  RuleCaps,
  RuleGeometry,
  EvaluateInput,
  InterpreterObservation,
  BoundInterval,
  Predicate,
  InputRole,
} from './types.js';
