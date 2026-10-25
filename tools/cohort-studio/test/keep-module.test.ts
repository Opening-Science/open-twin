import { describe, expect, it } from 'vitest';
import { buildKeepModule, keepModuleText, sha256Hex } from '../src/keep-module.ts';

const HTN = { code: '59621000', display: 'Essential hypertension (disorder)' };
const T2D = { code: '44054006', display: 'Diabetes mellitus type 2 (disorder)' };

const active = (c: { code: string; display: string }) => ({
  condition_type: 'Active Condition',
  codes: [{ system: 'SNOMED-CT', code: c.code, display: c.display }]
});

describe('buildKeepModule', () => {
  it('returns null when nothing is chosen, so no -k flag is passed', () => {
    expect(buildKeepModule([], 'any')).toBeNull();
    expect(buildKeepModule([], 'all')).toBeNull();
  });

  it('uses one Active Condition, without And/Or, for a single condition', () => {
    const m = buildKeepModule([HTN], 'all');
    expect(m?.name).toBe('Keep: Essential hypertension (disorder)');
    expect(m?.gmf_version).toBe(2);
    expect(m?.states).toEqual({
      Initial: {
        type: 'Initial',
        conditional_transition: [{ transition: 'Keep', condition: active(HTN) }, { transition: 'Terminal' }]
      },
      Keep: { type: 'Terminal' },
      Terminal: { type: 'Terminal' }
    });
  });

  it('"any of" is an Or over the codes, sorted by code', () => {
    const m = buildKeepModule([HTN, T2D], 'any');
    expect(m?.name).toBe('Keep: Diabetes mellitus type 2 (disorder) or Essential hypertension (disorder)');
    expect(m?.states.Initial.conditional_transition[0].condition).toEqual({
      condition_type: 'Or',
      conditions: [active(T2D), active(HTN)]
    });
  });

  it('"all of" is an And over the codes', () => {
    const m = buildKeepModule([T2D, HTN], 'all');
    expect(m?.name).toBe('Keep: Diabetes mellitus type 2 (disorder) and Essential hypertension (disorder)');
    expect(m?.states.Initial.conditional_transition[0].condition).toEqual({
      condition_type: 'And',
      conditions: [active(T2D), active(HTN)]
    });
  });

  it('gives the same bytes and hash whatever order the conditions were clicked, and drops duplicates', () => {
    const a = buildKeepModule([HTN, T2D], 'any');
    const b = buildKeepModule([T2D, HTN, T2D], 'any');
    if (!(a && b)) throw new Error('expected modules');
    expect(keepModuleText(a)).toBe(keepModuleText(b));
    expect(sha256Hex(keepModuleText(a))).toBe(sha256Hex(keepModuleText(b)));
  });

  it('gives different hashes for "any" and "all" of the same codes', () => {
    const any = buildKeepModule([HTN, T2D], 'any');
    const all = buildKeepModule([HTN, T2D], 'all');
    if (!(any && all)) throw new Error('expected modules');
    expect(sha256Hex(keepModuleText(any))).not.toBe(sha256Hex(keepModuleText(all)));
  });

  it('writes two-space JSON with a final newline', () => {
    const m = buildKeepModule([HTN], 'any');
    if (!m) throw new Error('expected module');
    const text = keepModuleText(m);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.startsWith('{\n  "name": "Keep: Essential hypertension (disorder)",\n  "gmf_version": 2,')).toBe(true);
  });
});
