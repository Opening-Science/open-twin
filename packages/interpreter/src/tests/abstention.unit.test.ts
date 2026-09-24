import { describe, expect, it } from 'vitest';
import { evaluate } from '../evaluate.js';
import { defaultRulePackPath, loadRulePackFile } from '../load-rule-pack.js';

describe('D-k abstention', () => {
  const pack = loadRulePackFile(defaultRulePackPath());

  it('emits sufficient_data=false when interval is null (does not skip the state)', () => {
    const doc = evaluate(pack, {
      subject_ref: 'urn:uuid:test',
      as_of: '2026-07-28T00:00:00.000Z',
      families: ['glycemic'],
      observations: [
        {
          biomarker_id: 'BM-128',
          value: 110,
          observed_at: '2026-07-15T00:00:00.000Z',
          reference_interval_id: null,
          interval: null
        }
      ]
    });

    expect(doc.states).toHaveLength(1);
    const state = doc.states[0];
    expect(state).toBeDefined();
    if (state === undefined) {
      throw new Error('expected one state');
    }
    expect(state.sufficient_data).toBe(false);
    expect(state.insufficient_reason).toMatch(/reference_interval null/);
    expect(state.contributing.some((c) => c.status === 'no_reference_interval')).toBe(true);
    expect(state.system_id).toBe('metabolic');
  });

  it('treats interpretive_band as no_reference_interval (D-c / D-a)', () => {
    const doc = evaluate(pack, {
      subject_ref: 'urn:uuid:test',
      as_of: '2026-07-28T00:00:00.000Z',
      families: ['lipid'],
      observations: [
        {
          biomarker_id: 'BM-190',
          value: 140,
          observed_at: '2026-07-15T00:00:00.000Z',
          reference_interval_id: 'RI-079',
          interval_record_kind: 'interpretive_band',
          interval: { low: 130, high: 159 }
        }
      ]
    });

    const state = doc.states[0];
    expect(state).toBeDefined();
    if (state === undefined) {
      throw new Error('expected one state');
    }
    expect(state.sufficient_data).toBe(false);
    expect(state.contributing.some((c) => c.biomarker_id === 'BM-190' && c.status === 'no_reference_interval')).toBe(
      true
    );
  });
});
