/**
 * WHAT: Rule-pack evaluator — compares observations to declarative predicates and emits interpretation-contract documents.
 * NOT:  No biomarker ids or named analytes in this module (enforced by purity test). Clinical cutoffs live in the YAML rule pack.
 * GOVERNED BY: docs/strategy/contracts/rules/rule-pack.v0.1.schema.json; docs/contracts/interpretation-contract.v0.2.schema.json; docs/contracts/confidence.md
 * CORRECTNESS: Golden fixtures under packages/interpreter/fixtures/golden/; purity test forbids BM-* and named analytes (not "no thresholds" generally)
 * GOTCHA: Freshness/confidence constants (STALE_AFTER_DAYS, recency breakpoints) live in confidence.ts by design. Null/band interval → no_reference_interval and sufficient_data=false (D-k / D-c).
 */

import {
  INTENDED_USE,
  SCHEMA_VERSION,
  type Contributor,
  type ContributorStatus,
  type OpenTwinInterpretationDocumentV02,
  type Severity,
  type SystemState,
  type UnrenderableState,
} from '@open-twin/interpretation-contract';
import { ageDays, computeConfidence, STALE_AFTER_DAYS } from './confidence.js';
import type {
  EvaluateInput,
  InterpreterObservation,
  LadderWhen,
  Rule,
  RulePack,
} from './types.js';

const SEVERITY_RANK: Record<Severity, number> = {
  none: 0,
  borderline: 1,
  mild: 2,
  moderate: 3,
  marked: 4,
  indeterminate: 5,
};

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(v as object).sort()) {
        sorted[key] = (v as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return v;
  });
}

function observationMap(
  observations: InterpreterObservation[],
): Map<string, InterpreterObservation> {
  const m = new Map<string, InterpreterObservation>();
  for (const o of observations) {
    const prev = m.get(o.biomarker_id);
    if (!prev) {
      m.set(o.biomarker_id, o);
      continue;
    }
    const prevAt = prev.observed_at ? Date.parse(prev.observed_at) : 0;
    const nextAt = o.observed_at ? Date.parse(o.observed_at) : 0;
    if (nextAt > prevAt || (nextAt === prevAt && stableStringify(o) < stableStringify(prev))) {
      m.set(o.biomarker_id, o);
    }
  }
  return m;
}

function contributorStatus(
  obs: InterpreterObservation | undefined,
  asOf: string,
): {
  status: ContributorStatus;
  observed_at: string | null;
  reference_interval_id: string | null;
  loinc_code?: string;
} {
  if (!obs || obs.value === null || obs.value === undefined) {
    return {
      status: 'missing',
      observed_at: null,
      reference_interval_id: null,
    };
  }
  if (obs.unit_incommensurable) {
    return {
      status: 'unit_incommensurable',
      observed_at: obs.observed_at,
      reference_interval_id: obs.reference_interval_id,
      loinc_code: obs.loinc_code,
    };
  }
  // D-c / D-a: an interpretive band is not a measured reference interval.
  if (
    obs.interval_record_kind === 'interpretive_band' ||
    obs.reference_interval_id == null ||
    obs.interval == null
  ) {
    return {
      status: 'no_reference_interval',
      observed_at: obs.observed_at,
      reference_interval_id:
        obs.interval_record_kind === 'interpretive_band' ? null : obs.reference_interval_id,
      loinc_code: obs.loinc_code,
    };
  }
  if (obs.observed_at != null && ageDays(obs.observed_at, asOf) > STALE_AFTER_DAYS) {
    return {
      status: 'stale',
      observed_at: obs.observed_at,
      reference_interval_id: obs.reference_interval_id,
      loinc_code: obs.loinc_code,
    };
  }
  return {
    status: 'present',
    observed_at: obs.observed_at,
    reference_interval_id: obs.reference_interval_id,
    loinc_code: obs.loinc_code,
  };
}

function buildContributors(
  rule: Rule,
  byId: Map<string, InterpreterObservation>,
  asOf: string,
): Contributor[] {
  const out: Contributor[] = [];
  for (const input of rule.inputs) {
    const obs = byId.get(input.biomarker_id);
    const meta = contributorStatus(obs, asOf);
    const c: Contributor = {
      biomarker_id: input.biomarker_id,
      status: meta.status,
      observed_at: meta.observed_at,
      reference_interval_id: meta.reference_interval_id,
    };
    if (meta.loinc_code !== undefined) c.loinc_code = meta.loinc_code;
    out.push(c);
  }
  out.sort((a, b) => a.biomarker_id.localeCompare(b.biomarker_id));
  return out;
}

function presentObs(
  biomarkerId: string,
  byId: Map<string, InterpreterObservation>,
  asOf: string,
): InterpreterObservation | null {
  const obs = byId.get(biomarkerId);
  const meta = contributorStatus(obs, asOf);
  if (meta.status !== 'present' || !obs) return null;
  return obs;
}

function requiredPresent(
  rule: Rule,
  byId: Map<string, InterpreterObservation>,
  asOf: string,
): boolean {
  return rule.inputs
    .filter((i) => i.role === 'required')
    .every((i) => presentObs(i.biomarker_id, byId, asOf) !== null);
}

function matchPredicate(
  when: LadderWhen,
  rule: Rule,
  byId: Map<string, InterpreterObservation>,
  asOf: string,
): boolean {
  const { predicate } = when;

  if (predicate === 'any_present_outside') {
    for (const input of rule.inputs) {
      const obs = presentObs(input.biomarker_id, byId, asOf);
      if (!obs?.interval) continue;
      const v = obs.value;
      if (v === null) continue;
      const { low, high } = obs.interval;
      if (low != null && v < low) return true;
      if (high != null && v > high) return true;
    }
    return false;
  }

  const id = when.input;
  if (!id) return false;
  const obs = presentObs(id, byId, asOf);
  if (!obs || obs.value === null || !obs.interval) return false;
  if (when.require_all_required_present && !requiredPresent(rule, byId, asOf)) {
    return false;
  }

  const v = obs.value;
  const { low, high } = obs.interval;

  switch (predicate) {
    case 'within_interval': {
      const okLow = low == null || v >= low;
      const okHigh = high == null || v <= high;
      return okLow && okHigh;
    }
    case 'below_low':
      return low != null && v < low;
    case 'above_high':
      return high != null && v > high;
    case 'outside_interval': {
      const below = low != null && v < low;
      const above = high != null && v > high;
      return below || above;
    }
    case 'ratio_to_high_at_least': {
      if (high == null || high === 0 || when.factor === undefined) return false;
      return v / high >= when.factor;
    }
    case 'ratio_to_low_at_most': {
      if (low == null || low === 0 || when.factor === undefined) return false;
      return v / low <= when.factor;
    }
    default:
      return false;
  }
}

function resolveSeverity(
  rule: Rule,
  byId: Map<string, InterpreterObservation>,
  asOf: string,
): Severity {
  for (const step of rule.severity_ladder) {
    if (matchPredicate(step.when, rule, byId, asOf)) {
      return step.severity;
    }
  }
  return 'indeterminate';
}

function applySeverityCap(severity: Severity, max?: Severity): Severity {
  if (!max) return severity;
  if (max === 'indeterminate') {
    return severity === 'none' ? 'none' : 'indeterminate';
  }
  if (severity === 'indeterminate') return 'indeterminate';
  if (SEVERITY_RANK[severity] > SEVERITY_RANK[max]) return max;
  return severity;
}

function insufficientReason(contributors: Contributor[], rule: Rule): string | undefined {
  const requiredIds = new Set(
    rule.inputs.filter((i) => i.role === 'required').map((i) => i.biomarker_id),
  );

  const noIntervalRequired = contributors
    .filter((c) => c.status === 'no_reference_interval' && requiredIds.has(c.biomarker_id))
    .map((c) => c.biomarker_id);
  if (noIntervalRequired.length > 0) {
    return `reference_interval null for ${noIntervalRequired.sort().join(', ')} (D-k)`;
  }

  const noIntervalAny = contributors
    .filter((c) => c.status === 'no_reference_interval')
    .map((c) => c.biomarker_id);
  if (noIntervalAny.length > 0) {
    return `reference_interval null for ${noIntervalAny.sort().join(', ')} (D-k)`;
  }

  const missingRequired = contributors
    .filter((c) => requiredIds.has(c.biomarker_id) && c.status === 'missing')
    .map((c) => c.biomarker_id);
  if (missingRequired.length > 0) {
    return `required markers missing: ${missingRequired.sort().join(', ')}`;
  }

  const staleRequired = contributors
    .filter((c) => requiredIds.has(c.biomarker_id) && c.status === 'stale')
    .map((c) => c.biomarker_id);
  if (staleRequired.length > 0) {
    return `required markers stale: ${staleRequired.sort().join(', ')}`;
  }

  const unitBad = contributors
    .filter((c) => c.status === 'unit_incommensurable')
    .map((c) => c.biomarker_id);
  if (unitBad.length > 0) {
    return `unit_incommensurable: ${unitBad.sort().join(', ')}`;
  }

  const optionalOnly = rule.inputs.every((i) => i.role === 'optional');
  if (optionalOnly && !contributors.some((c) => c.status === 'present')) {
    return 'no optional markers present';
  }

  return undefined;
}

/**
 * Evaluate every rule in the pack. Output is deterministic: same pack + input →
 * byte-identical JSON after stable key ordering.
 */
export function evaluate(pack: RulePack, input: EvaluateInput): OpenTwinInterpretationDocumentV02 {
  const byId = observationMap(input.observations);
  const rules = pack.rules
    .filter((r) => !input.families || input.families.includes(r.family))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  const states: SystemState[] = [];
  const unrenderable: UnrenderableState[] = [];

  for (const rule of rules) {
    const contributing = buildContributors(rule, byId, input.as_of);
    let severity = resolveSeverity(rule, byId, input.as_of);
    severity = applySeverityCap(severity, rule.caps?.max_severity);

    let confidence = computeConfidence(contributing, rule.rule_strength, input.as_of);
    if (rule.caps?.max_confidence !== undefined) {
      confidence = Math.min(confidence, rule.caps.max_confidence);
      confidence = Math.round(confidence * 10_000 + Number.EPSILON) / 10_000;
    }

    const reason = insufficientReason(contributing, rule);
    const ok = reason === undefined;

    const base = {
      severity,
      confidence,
      sufficient_data: ok,
      ...(ok ? {} : { insufficient_reason: reason }),
      contributing: contributing as [Contributor, ...Contributor[]],
    };

    if (rule.emit === 'state') {
      if (!rule.system_id || !rule.geometry) {
        throw new Error(`rule ${rule.id}: emit=state requires system_id and geometry`);
      }
      states.push({
        system_id: rule.system_id,
        ...base,
        interpretive_anatomy_source: 'curated_table',
        geometry: {
          fma_id: rule.geometry.fma_id,
          ...(rule.geometry.uberon_id ? { uberon_id: rule.geometry.uberon_id } : {}),
        },
      });
    } else {
      if (!rule.unrenderable_id || !rule.unrenderable_reason) {
        throw new Error(`rule ${rule.id}: emit=unrenderable requires id and reason`);
      }
      unrenderable.push({
        id: rule.unrenderable_id,
        ...(rule.description ? { label: rule.description } : {}),
        reason: rule.unrenderable_reason,
        ...base,
      });
    }
  }

  states.sort((a, b) => {
    const ca = a.contributing.map((c) => c.biomarker_id).join(',');
    const cb = b.contributing.map((c) => c.biomarker_id).join(',');
    return ca.localeCompare(cb) || a.system_id.localeCompare(b.system_id);
  });
  unrenderable.sort((a, b) => a.id.localeCompare(b.id));

  return {
    schema_version: SCHEMA_VERSION,
    intended_use: INTENDED_USE,
    not_for_diagnostic_use: true,
    subject_ref: input.subject_ref,
    as_of: input.as_of,
    states,
    unrenderable,
  };
}

/** Canonical JSON bytes for golden comparison. */
export function serializeDocument(doc: OpenTwinInterpretationDocumentV02): string {
  return `${stableStringify(doc)}\n`;
}
