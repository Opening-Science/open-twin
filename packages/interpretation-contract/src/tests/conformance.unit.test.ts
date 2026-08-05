/**
 * WHAT: Proves accept fixtures pass and every reject fixture fails with the expected code.
 * NOT:  Does not invent interpretation rules.
 * GOVERNED BY: DECISIONS.md#d12; DECISIONS.md#d13
 * CORRECTNESS: fixtures/reject/* must be non-conformant; fixtures/accept/* must be conformant
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type ConformanceErrorCode, validateInterpretationDocument } from '../validate.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures');

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const REJECT_EXPECTATIONS: Record<string, ConformanceErrorCode> = {
  'unknown-system-id.json': 'UNKNOWN_SYSTEM_ID',
  'confidence-gt-1.json': 'CONFIDENCE_OUT_OF_RANGE',
  'empty-contributing.json': 'EMPTY_CONTRIBUTING',
  'insufficient-empty-contributing.json': 'INSUFFICIENT_EMPTY_CONTRIBUTING',
  'loinc-system-axis.json': 'LOINC_SYSTEM_AXIS_ANATOMY',
  'sctid-in-published.json': 'SCTID_IN_PUBLISHED',
  'unrenderable-rerouted.json': 'UNRENDERABLE_REROUTED'
};

describe('interpretation-contract conformance', () => {
  it('accepts the minimal valid fixture', () => {
    const doc = loadJson(join(FIXTURES, 'accept/minimal.valid.json'));
    const result = validateInterpretationDocument(doc);
    expect(result.ok, JSON.stringify(result.errors, null, 2)).toBe(true);
    expect(result.document?.schema_version).toBe('interpretation-contract.v0.2');
    expect(result.document?.intended_use).toBe('research_hypothesis_generation_n_of_1');
    expect(result.document?.not_for_diagnostic_use).toBe(true);
  });

  it('rejects every fixture under fixtures/reject with the expected code', () => {
    const dir = join(FIXTURES, 'reject');
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    expect(files).toEqual(Object.keys(REJECT_EXPECTATIONS).sort());

    for (const file of files) {
      const expected = REJECT_EXPECTATIONS[file];
      if (expected === undefined) {
        throw new Error(`missing REJECT_EXPECTATIONS entry for ${file}`);
      }
      const result = validateInterpretationDocument(loadJson(join(dir, file)));
      expect(result.ok, file).toBe(false);
      const codes = result.errors.map((e) => e.code);
      expect(codes, `${file} errors=${JSON.stringify(result.errors)}`).toContain(expected);
    }
  });
});
