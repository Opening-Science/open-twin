/**
 * WHAT: Reproducibility check: runs one small recipe with a keep module several times into separate folders through
 *       generate.sh and fails unless every run's patient-file checksum is identical.
 * NOT:  Does not run in `pnpm test` (it needs Java 21 and the Synthea JAR); run it with `pnpm --filter
 *       @open-twin/cohort-studio repro`.
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Small runs can hide a race; the default (50 people, 3 runs) is the smallest size that showed one in testing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSyntheaPin } from './paths.ts';
import { checkRecipe, DEFAULT_DATE } from './recipe.ts';
import { contentChecksum, Runner } from './runner.ts';

const out = (s: string): boolean => process.stdout.write(`${s}\n`);

function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

const REPRO_RECIPE = {
  population: 50,
  seed: 7,
  clinicianSeed: 8,
  state: 'Massachusetts',
  age: { min: 40, max: 75 },
  sex: 'any',
  referenceDate: DEFAULT_DATE,
  endDate: DEFAULT_DATE,
  conditions: {
    match: 'any',
    chosen: [
      { code: '59621000', display: 'Essential hypertension (disorder)' },
      { code: '44054006', display: 'Diabetes mellitus type 2 (disorder)' }
    ]
  },
  customModules: []
};

async function main(): Promise<number> {
  const population = flag('--population', REPRO_RECIPE.population);
  const runs = flag('--runs', 3);
  const keep = process.argv.includes('--keep');
  const checked = checkRecipe({ ...REPRO_RECIPE, population }, readSyntheaPin());
  if (!checked.recipe) throw new Error(checked.errors.join(' '));
  const base = mkdtempSync(join(tmpdir(), 'cohort-repro-'));
  out(`Recipe ${checked.recipe.recipeSha256}: ${population} people aged 40-75 with hypertension or type 2 diabetes`);
  out(`Running it ${runs} times into ${base}`);
  const sums: string[] = [];
  for (let i = 1; i <= runs; i++) {
    const runner = new Runner();
    const dir = join(base, `run-${i}`);
    const started = runner.start(checked.recipe, dir);
    const run = await runner.wait(started.runId);
    if (run.status !== 'finished' || !run.results) {
      out(`run ${i}: ${run.status} ${run.error ?? ''}`);
      return 1;
    }
    const recomputed = contentChecksum(join(dir, 'out', 'fhir'));
    const manifestSum = run.results.manifest?.fhirContentSha256;
    if (manifestSum !== undefined && manifestSum !== recomputed) {
      out(`run ${i}: manifest checksum ${String(manifestSum)} differs from recomputed ${recomputed}`);
      return 1;
    }
    sums.push(recomputed);
    const r = run.results.records;
    out(
      `run ${i}: ${recomputed}  (${r.total} records, ${r.alive} alive, ${r.dead} died; ${((run.elapsedMs ?? 0) / 1000).toFixed(1)} s)`
    );
  }
  const same = sums.every((s) => s === sums[0]);
  out(same ? `PASS: all ${runs} runs produced identical patient files.` : 'FAIL: the runs differ.');
  if (same && !keep) rmSync(base, { recursive: true, force: true });
  return same ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    out(`error: ${(e as Error).message}`);
    process.exit(1);
  }
);
