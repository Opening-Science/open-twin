import { describe, expect, it } from 'vitest';
import {
  defaultRulePackPath,
  loadRulePackFile,
  loadRulePackFromYaml,
  RulePackValidationError,
} from '../load-rule-pack.js';

describe('rule pack loader', () => {
  it('loads and validates open-twin.v0.1', () => {
    const pack = loadRulePackFile(defaultRulePackPath());
    expect(pack.schema_version).toBe('rule-pack.v0.1');
    expect(pack.pack_id).toBe('open-twin.v0.1');
    expect(pack.rules.length).toBeGreaterThanOrEqual(12);

    const byFamily = new Map<string, string[]>();
    for (const r of pack.rules) {
      const list = byFamily.get(r.family) ?? [];
      list.push(r.id);
      byFamily.set(r.family, list);
      expect(r.clinical_basis === 'heuristic_no_guideline' || r.clinical_basis.startsWith('guideline:')).toBe(
        true,
      );
    }

    expect(byFamily.has('hepatic')).toBe(true);
    expect(byFamily.has('glycemic')).toBe(true);
    expect(byFamily.has('lipid')).toBe(true);
    expect(byFamily.has('micronutrient')).toBe(true);
    expect(byFamily.has('electrolyte')).toBe(true);
    expect(byFamily.has('thyroid')).toBe(true);
    expect(byFamily.has('bone')).toBe(true);
    expect(byFamily.has('gonadal')).toBe(true);
    expect(byFamily.has('renal')).toBe(true);
    expect(byFamily.has('haematologic')).toBe(true);
    expect(byFamily.has('immune')).toBe(true);
    expect(byFamily.has('inflammation')).toBe(true);

    const glycemic = pack.rules.find((r) => r.id === 'glycemic_dysregulation');
    expect(glycemic?.system_id).toBe('metabolic');
    expect(glycemic?.system_id).not.toBe('digestive');

    const cholestatic = pack.rules.find((r) => r.id === 'hepatic_cholestatic');
    expect(cholestatic?.caps?.max_severity).toBe('indeterminate');
    expect(cholestatic?.caps?.max_confidence).toBe(0.4);
  });

  it('rejects invented guideline citations', () => {
    const yaml = `
schema_version: rule-pack.v0.1
pack_id: bad
rules:
  - id: x
    family: glycemic
    clinical_basis: guideline:does-not-exist
    rule_strength: 0.5
    emit: state
    system_id: metabolic
    geometry: { fma_id: "FMA:1" }
    inputs:
      - biomarker_id: BM-128
        role: required
    severity_ladder:
      - severity: none
        when: { predicate: within_interval, input: BM-128 }
`;
    expect(() => loadRulePackFromYaml(yaml)).toThrow(RulePackValidationError);
  });
});
