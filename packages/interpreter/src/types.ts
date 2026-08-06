/**
 * WHAT: Shared types for rule-pack documents and interpreter observation inputs.
 * NOT:  Does not evaluate rules or encode clinical thresholds — those live in YAML.
 * GOVERNED BY: docs/strategy/contracts/rules/rule-pack.v0.1.schema.json
 * CORRECTNESS: Schema validation in load-rule-pack.ts against the committed JSON Schema
 */

import type { Severity, SystemId, UnrenderableReason } from '@open-twin/interpretation-contract';

export type InputRole = 'required' | 'optional';

export type Predicate =
  | 'within_interval'
  | 'below_low'
  | 'above_high'
  | 'outside_interval'
  | 'ratio_to_high_at_least'
  | 'ratio_to_low_at_most'
  | 'any_present_outside';

export interface RuleInput {
  biomarker_id: string;
  role: InputRole;
}

export interface LadderWhen {
  predicate: Predicate;
  input?: string;
  factor?: number;
  require_all_required_present?: boolean;
}

export interface LadderStep {
  severity: Severity;
  when: LadderWhen;
}

export interface RuleCaps {
  max_severity?: Severity;
  max_confidence?: number;
}

export interface RuleGeometry {
  fma_id: string;
  uberon_id?: string;
}

export interface Rule {
  id: string;
  family: string;
  description?: string;
  clinical_basis: string;
  rule_strength: number;
  emit: 'state' | 'unrenderable';
  system_id?: SystemId;
  unrenderable_reason?: UnrenderableReason;
  unrenderable_id?: string;
  geometry?: RuleGeometry;
  inputs: RuleInput[];
  severity_ladder: LadderStep[];
  caps?: RuleCaps;
  gap_notes?: string;
}

export interface RulePack {
  schema_version: 'rule-pack.v0.1';
  pack_id: string;
  description?: string;
  rules: Rule[];
}

/** Bound numeric interval supplied by the caller (engine never looks up Anchor data). */
export interface BoundInterval {
  low: number | null;
  high: number | null;
}

/**
 * One observation the evaluator may read. Clinical binding (which interval, which
 * unit) is decided upstream; the engine only compares numbers and statuses.
 */
export interface InterpreterObservation {
  biomarker_id: string;
  value: number | null;
  observed_at: string | null;
  /** Null means abstain (D-a / D-k) — still emit the state. */
  reference_interval_id: string | null;
  /**
   * Kind of the bound interval record. Interpretive bands are already an
   * interpretation (D-c) and MUST NOT stand in for a measured reference interval —
   * the engine treats them as no_reference_interval for abstention (D-a / D-k).
   */
  interval_record_kind?: 'reference_interval' | 'interpretive_band' | null;
  /** Bounds for the bound interval; null/omitted with a present value → no_reference_interval. */
  interval?: BoundInterval | null;
  loinc_code?: string;
  /** Upstream unit mismatch flag. */
  unit_incommensurable?: boolean;
}

export interface EvaluateInput {
  subject_ref: string;
  as_of: string;
  observations: InterpreterObservation[];
  /** Optional filter for goldens / tests; default evaluates every rule in the pack. */
  families?: string[];
}
