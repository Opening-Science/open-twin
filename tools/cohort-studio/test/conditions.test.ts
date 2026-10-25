import { describe, expect, it } from 'vitest';
import { classify, extractConditions } from '../src/conditions.ts';

// Shaped like Synthea's module JSON; codes and displays copied from the v4.0.0 modules they are named after.
const hypertension = {
  name: 'Hypertension',
  states: {
    Initial: { type: 'Initial', direct_transition: 'Onset_Hypertension' },
    Onset_Hypertension: {
      type: 'ConditionOnset',
      codes: [{ system: 'SNOMED-CT', code: '59621000', display: 'Essential hypertension (disorder)' }],
      direct_transition: 'Terminal'
    },
    Terminal: { type: 'Terminal' }
  }
};
const sinusitis = {
  name: 'Sinusitis',
  states: {
    Viral: {
      type: 'ConditionOnset',
      codes: [{ system: 'SNOMED-CT', code: '444814009', display: 'Viral sinusitis (disorder)' }],
      assign_to_attribute: 'sinusitis_condition'
    },
    Bacterial: {
      type: 'ConditionOnset',
      codes: [
        { system: 'SNOMED-CT', code: '75498004', display: 'Acute bacterial sinusitis (disorder)' },
        { system: 'ICD10', code: 'J01.90', display: 'Acute sinusitis, unspecified' }
      ]
    },
    End_By_Attribute: { type: 'ConditionEnd', referenced_by_attribute: 'sinusitis_condition' },
    End_By_State: { type: 'ConditionEnd', condition_onset: 'Bacterial' }
  }
};
const ckd = {
  name: 'Kidney conditions',
  states: {
    Stage1: {
      type: 'ConditionOnset',
      codes: [{ system: 'SNOMED-CT', code: '431855005', display: 'Chronic kidney disease stage 1 (disorder)' }]
    },
    End_Stage1: {
      type: 'ConditionEnd',
      codes: [{ system: 'SNOMED-CT', code: '431855005', display: 'Chronic kidney disease stage 1 (disorder)' }]
    },
    Again_Hypertension: {
      type: 'ConditionOnset',
      codes: [{ system: 'SNOMED-CT', code: '59621000', display: 'Hypertension, later display ignored' }]
    }
  }
};

describe('extractConditions', () => {
  const out = extractConditions([
    { path: 'sinusitis', json: sinusitis },
    { path: 'metabolic_syndrome/kidney_conditions', json: ckd },
    { path: 'hypertension', json: hypertension },
    { path: 'broken', json: 'not a module' }
  ]);

  it('lists each SNOMED CT code once, sorted by display, and ignores other code systems', () => {
    expect(out.map((c) => c.code)).toEqual(['75498004', '431855005', '59621000', '444814009']);
  });

  it('keeps the display of the first module by path and every module that starts the code', () => {
    expect(out.find((c) => c.code === '59621000')).toEqual({
      code: '59621000',
      display: 'Essential hypertension (disorder)',
      group: 'cardio-metabolic',
      modules: ['hypertension', 'metabolic_syndrome/kidney_conditions'],
      mayResolve: false
    });
  });

  it('marks a condition that a ConditionEnd can end, by attribute, onset state or code', () => {
    const flags = Object.fromEntries(out.map((c) => [c.code, c.mayResolve]));
    expect(flags).toEqual({ '444814009': true, '75498004': true, '431855005': true, '59621000': false });
  });

  it('groups by the display name', () => {
    const groups = Object.fromEntries(out.map((c) => [c.code, c.group]));
    expect(groups).toEqual({
      '444814009': 'infection',
      '75498004': 'infection',
      '431855005': 'kidney',
      '59621000': 'cardio-metabolic'
    });
  });
});

describe('classify', () => {
  it.each([
    ['Diabetes mellitus type 2 (disorder)', 'cardio-metabolic'],
    ['Disorder of kidney due to diabetes mellitus (disorder)', 'kidney'],
    ['Non-small cell lung cancer (disorder)', 'cancer'],
    ['Asthma (disorder)', 'respiratory'],
    ['Pulmonary emphysema (disorder)', 'respiratory'],
    ["Alzheimer's disease (disorder)", 'neuro'],
    ['Osteoarthritis of knee (disorder)', 'musculoskeletal'],
    ['Major depressive disorder (disorder)', 'mental health'],
    ['Streptococcal sore throat (disorder)', 'infection'],
    ['Sepsis caused by Pseudomonas (disorder)', 'infection'],
    ['Normal pregnancy (finding)', 'other'],
    ['Gingivitis (disorder)', 'other']
  ])('%s → %s', (display, group) => {
    expect(classify(display)).toBe(group);
  });
});
