/**
 * WHAT: Command-line runner: reads a recipe file and runs it through generate.sh, exactly as the studio would.
 * NOT:  Does not edit the recipe; an invalid recipe is reported and nothing runs.
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readSyntheaPin } from './paths.ts';
import { checkRecipe } from './recipe.ts';
import { isPersonLine, parseRecordsLine, Runner } from './runner.ts';

const out = (s: string): boolean => process.stdout.write(`${s}\n`);
const usage = 'Usage: pnpm cohort <recipe.json> [--out <empty folder>]';

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const base = process.env.INIT_CWD ?? process.cwd();
  const file = args.find((a) => !a.startsWith('--'));
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : undefined;
  if (!file || (outIndex >= 0 && !outDir)) {
    out(usage);
    return 2;
  }
  const checked = checkRecipe(JSON.parse(readFileSync(resolve(base, file), 'utf8')), readSyntheaPin());
  for (const w of checked.warnings) out(`warning: ${w}`);
  if (!checked.recipe) {
    for (const e of checked.errors) out(`error: ${e}`);
    return 1;
  }
  const runner = new Runner();
  const started = runner.start(checked.recipe, outDir ? resolve(base, outDir) : undefined);
  out(`Run ${started.runId}: recipe ${checked.recipe.recipeSha256}`);
  const run = await runner.wait(started.runId, (line) => {
    if (isPersonLine(line) || parseRecordsLine(line) || line.startsWith('synthea:')) out(line);
  });
  if (run.status !== 'finished' || !run.results) {
    out(`Run ${run.status}: ${run.error ?? ''}`);
    return 1;
  }
  const r = run.results;
  out(`Finished in ${((run.elapsedMs ?? 0) / 1000).toFixed(1)} s`);
  out(`Records: ${r.records.total} (alive ${r.records.alive}, died ${r.records.dead}); ${r.files} files`);
  out(`Content checksum: ${r.fhirContentSha256}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    out(`error: ${(e as Error).message}`);
    process.exit(1);
  }
);
