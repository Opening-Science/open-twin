/**
 * WHAT: Round-trip and D-e / determinism gates for the compiled Anchor-layer artefact.
 * NOT:  Does not invent LOINC codes or auto-fix property mismatches.
 * GOVERNED BY: DECISIONS.md#d11; D-a–D-e
 * CORRECTNESS: 67 markers; exactly BM-060/BM-186/BM-405 mismatches; byte-identical sha256 across recompiles
 * GOTCHA: An integration test asserting only on exit code cannot distinguish the failure it wants from a failure to run at all (module-resolution / syntax errors also exit non-zero).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ARTEFACT_PATH,
  ARTEFACT_SHA256_PATH,
  detectPropertyMismatches,
  loadAnchorLayer,
  PROPERTY_MISMATCH_IDS,
  readSidecarSha256,
  sha256OfFile,
} from '../index.js';

/** packages/anchor-layer → repo root (not packages/). */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const COMPILE = join(ROOT, 'scripts/compile-anchor-layer.ts');

function runCompileAt(scriptPath: string): { exitCode: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('pnpm', ['exec', 'tsx', scriptPath], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: String(stdout ?? ''), stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: e.status ?? 1,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
    };
  }
}

/**
 * Assert the compiler failed for D-e property mismatches — not for failing to start.
 * Callable from the negative meta-test with a broken path; that call must throw.
 */
export function assertPropertyMismatchCompilerFailure(result: {
  exitCode: number;
  stdout: string;
  stderr: string;
}): void {
  const combined = `${result.stdout}\n${result.stderr}`;
  expect(result.exitCode, `expected D-e exit 1; output:\n${combined}`).toBe(1);
  expect(combined, 'module-resolution failure must not satisfy D-e').not.toMatch(
    /ERR_MODULE_NOT_FOUND|Cannot find module/,
  );
  expect(combined, 'syntax/parse failure must not satisfy D-e').not.toMatch(
    /SyntaxError|Transform failed/,
  );
  for (const id of PROPERTY_MISMATCH_IDS) {
    expect(combined, `D-e output must name ${id}`).toContain(id);
  }
  expect(combined, 'D-e property-mismatch reason must be present').toMatch(/property mismatch/i);
}

describe('anchor-layer artefact', () => {
  it('round-trips all 67 biomarkers without (low, high) on the marker', () => {
    const layer = loadAnchorLayer();
    expect(layer.schema_version).toBe('anchor-layer.v1');
    expect(layer.biomarkers).toHaveLength(67);
    expect(layer.reference_intervals).toHaveLength(93);
    expect(layer.interpretive_bands).toHaveLength(5);
    expect(layer.counts.markers_with_reference_interval).toBe(30);
    expect(layer.counts.markers_with_interpretive_band_only).toBe(1);
    expect(layer.counts.markers_with_neither).toBe(36);

    const ids = layer.biomarkers.map((b) => b.biomarker_id);
    expect(new Set(ids).size).toBe(67);

    for (const b of layer.biomarkers) {
      expect(b).toMatchObject({
        biomarker_id: expect.any(String),
        name_de: expect.any(String),
        loinc_code: expect.any(String),
        loinc_display: expect.any(String),
        tier: expect.any(String),
        unit_source: expect.any(String),
        unit_ucum: expect.any(String),
        system_id: expect.any(String),
        interpretive_anatomy_source: 'curated_table',
        provenance: {
          source_file: expect.stringContaining('AnchorLayer_v3_Consolidated.xlsx'),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          sheet: 'Anchor_Core_Set',
          row: expect.any(Number),
        },
      });
      expect(b).not.toHaveProperty('low');
      expect(b).not.toHaveProperty('high');
    }

    for (const ri of layer.reference_intervals) {
      expect(ri.record_kind).toBe('reference_interval');
    }
    for (const band of layer.interpretive_bands) {
      expect(band.record_kind).toBe('interpretive_band');
    }
  });

  it('detects exactly the three LOINC property/unit mismatches (D-e)', () => {
    const layer = loadAnchorLayer();
    const mismatches = detectPropertyMismatches(layer);
    expect(mismatches.map((m) => m.biomarker_id).sort()).toEqual([...PROPERTY_MISMATCH_IDS].sort());
    expect(mismatches).toHaveLength(3);
  });

  it('compiler exits non-zero listing the three mismatches and writes a stable artefact', () => {
    const before = readFileSync(ARTEFACT_PATH);
    const beforeSha = createHash('sha256').update(before).digest('hex');

    const first = runCompileAt(COMPILE);
    assertPropertyMismatchCompilerFailure(first);

    const midSha = sha256OfFile();
    expect(midSha).toBe(beforeSha);
    expect(readSidecarSha256()).toBe(midSha);

    const second = runCompileAt(COMPILE);
    assertPropertyMismatchCompilerFailure(second);
    const afterSha = sha256OfFile();
    expect(afterSha).toBe(midSha);
    expect(readFileSync(ARTEFACT_SHA256_PATH, 'utf8')).toContain(afterSha);
  });

  it('meta: D-e assertions FAIL when the compiler script cannot be resolved', () => {
    const missing = join(ROOT, 'scripts/does-not-exist-compile-anchor-layer.ts');
    const result = runCompileAt(missing);
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/ERR_MODULE_NOT_FOUND|Cannot find module/);
    expect(() => assertPropertyMismatchCompilerFailure(result)).toThrow(/property mismatch|BM-060|module-resolution/i);
  });
});
