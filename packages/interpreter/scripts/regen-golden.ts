/**
 * WHAT: Regenerates golden expected.json files for interpreter fixtures.
 * NOT:  Does not invent clinical rules; only re-runs the evaluator.
 * GOVERNED BY: packages/interpreter/fixtures/golden/README.md
 * CORRECTNESS: Requires --reason; appends to REASONS.md for CI audit trail
 *
 * Usage: pnpm --filter @open-twin/interpreter regen-golden -- --reason "why"
 * Optional: --family hepatic (default: all)
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, serializeDocument } from '../src/evaluate.js';
import { defaultRulePackPath, loadRulePackFile } from '../src/load-rule-pack.js';
import type { EvaluateInput } from '../src/types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = join(ROOT, 'fixtures', 'golden');
const REASONS = join(GOLDEN, 'REASONS.md');

function parseArgs(argv: string[]): { reason?: string; family?: string } {
  let reason: string | undefined;
  let family: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reason') reason = argv[++i];
    else if (a === '--family') family = argv[++i];
    else if (a?.startsWith('--reason=')) reason = a.slice('--reason='.length);
    else if (a?.startsWith('--family=')) family = a.slice('--family='.length);
  }
  return { reason, family };
}

const { reason, family } = parseArgs(process.argv.slice(2));
if (!reason || reason.trim().length < 8) {
  console.error('regen-golden requires --reason "<written reason at least 8 chars>"');
  process.exit(2);
}

const pack = loadRulePackFile(defaultRulePackPath());
const families = readdirSync(GOLDEN, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((name) => !family || name === family)
  .sort();

if (families.length === 0) {
  console.error('No golden family directories found');
  process.exit(1);
}

const stamp = new Date().toISOString();
const lines: string[] = ['', `## ${stamp}`, '', `- reason: ${reason.trim()}`, `- families: ${families.join(', ')}`, ''];

for (const fam of families) {
  const inputPath = join(GOLDEN, fam, 'input.json');
  if (!existsSync(inputPath)) {
    console.error(`missing ${inputPath}`);
    process.exit(1);
  }
  const input = JSON.parse(readFileSync(inputPath, 'utf8')) as EvaluateInput;
  input.families = [fam];
  const doc = evaluate(pack, input);
  const out = serializeDocument(doc);
  writeFileSync(join(GOLDEN, fam, 'expected.json'), out, 'utf8');
  lines.push(`- regenerated \`${fam}/expected.json\``);
  console.log(`wrote ${fam}/expected.json`);
}

if (!existsSync(REASONS)) {
  writeFileSync(REASONS, '# Golden fixture regeneration log\n', 'utf8');
}
appendFileSync(REASONS, `${lines.join('\n')}\n`, 'utf8');
console.log('appended reason to REASONS.md');
