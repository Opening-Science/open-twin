/**
 * WHAT: Proves evaluate collapses duplicate system_id states and throws on conflicting geometry.
 * NOT:  Does not invent clinical cutoffs; biomarkers here are test fixtures only.
 * GOVERNED BY: DECISIONS.md#d12; docs/contracts/interpretation-contract.v0.2.schema.json
 * CORRECTNESS: one state per system_id when geometry matches; throw when FMA disagrees
 */
import { describe, expect, it } from 'vitest';
import { evaluate } from '../evaluate.js';
import type { InterpreterObservation, Rule, RulePack } from '../types.js';

function pack(rules: Rule[]): RulePack {
  return { schema_version: 'rule-pack.v0.1', pack_id: 'collapse-test', rules };
}

function stateRule(id: string, biomarkerId: string, fmaId: string, uberonId?: string): Rule {
  return {
    id,
    family: 'collapse',
    clinical_basis: 'heuristic_no_guideline',
    rule_strength: 0.5,
    emit: 'state',
    system_id: 'digestive',
    geometry: uberonId ? { fma_id: fmaId, uberon_id: uberonId } : { fma_id: fmaId },
    inputs: [{ biomarker_id: biomarkerId, role: 'required' }],
    severity_ladder: [
      { severity: 'mild', when: { predicate: 'above_high', input: biomarkerId } },
      { severity: 'none', when: { predicate: 'within_interval', input: biomarkerId } }
    ]
  };
}

function observation(biomarkerId: string, value: number): InterpreterObservation {
  return {
    biomarker_id: biomarkerId,
    value,
    observed_at: '2026-07-20T00:00:00.000Z',
    reference_interval_id: 'RI-1',
    interval: { low: 0, high: 10 }
  };
}

const inputBase = {
  subject_ref: 'urn:uuid:test',
  as_of: '2026-07-28T00:00:00.000Z'
};

describe('collapse states by system_id', () => {
  it('merges two emit=state rules that share system_id and geometry into one row', () => {
    const doc = evaluate(
      pack([stateRule('a', 'BM-001', 'FMA:1', 'UBERON:1'), stateRule('b', 'BM-002', 'FMA:1', 'UBERON:1')]),
      {
        ...inputBase,
        observations: [observation('BM-001', 20), observation('BM-002', 20)]
      }
    );
    expect(doc.states).toHaveLength(1);
    const state = doc.states[0];
    expect(state?.system_id).toBe('digestive');
    expect(state?.severity).toBe('mild');
    expect(state?.geometry).toEqual({ fma_id: 'FMA:1', uberon_id: 'UBERON:1' });
    expect(state?.contributing.map((c) => c.biomarker_id)).toEqual(['BM-001', 'BM-002']);
  });

  it('throws when the same system_id is emitted with conflicting geometry', () => {
    expect(() =>
      evaluate(pack([stateRule('a', 'BM-001', 'FMA:1'), stateRule('b', 'BM-002', 'FMA:2')]), {
        ...inputBase,
        observations: [observation('BM-001', 20), observation('BM-002', 20)]
      })
    ).toThrow(/duplicate system_id "digestive" with conflicting geometry/);
  });
});
