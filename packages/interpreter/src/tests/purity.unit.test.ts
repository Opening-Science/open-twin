/**
 * Engine purity: evaluate.ts has no biomarker ids or named analytes (enforced).
 * Freshness/confidence constants live in confidence.ts by design — not scanned here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'evaluate.ts');

describe('engine purity', () => {
  const src = readFileSync(SRC, 'utf8');

  it('imports no biomarker id', () => {
    expect(src).not.toMatch(/BM-\d+/);
  });

  it('imports no named analytes or a few literal threshold shapes', () => {
    // Does NOT assert "no thresholds" generally. Forbid named analytes + a few shapes.
    expect(src).not.toMatch(/\b(ALT|AST|GGT|HbA1c|TSH|LDL|HDL)\b/);
    // No hardcoded ratio cutoffs (e.g. 1.3, 5x ULN) as numeric comparisons to values.
    expect(src).not.toMatch(/\/\s*high\s*>=\s*\d/);
    expect(src).not.toMatch(/factor\s*=\s*\d/);
    expect(src).not.toMatch(/\bULN\b/);
  });

  it('does not load the rule pack or Anchor artefact', () => {
    expect(src).not.toMatch(/open-twin\.v0\.1\.yaml/);
    expect(src).not.toMatch(/anchor-layer/);
    expect(src).not.toMatch(/readFileSync/);
    expect(src).not.toMatch(/from ['"]yaml['"]/);
    expect(src).not.toMatch(/import\s*\(\s*['"]yaml['"]\s*\)/);
    expect(src).not.toMatch(/require\s*\(\s*['"]yaml['"]\s*\)/);
  });
});
