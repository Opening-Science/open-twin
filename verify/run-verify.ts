/**
 * WHAT: Runs every registered verify gate, prints each result, exits non-zero only on blocking failures.
 * NOT:  Does not short-circuit after the first failure — the baseline needs the full picture.
 * GOVERNED BY: docs/findings/verify-baseline.md; package.json verify script
 * CORRECTNESS: NONE — orchestrator only; each gate names its own authority
 * GOTCHA: Advisory gates print FAIL but do not fail the aggregate. Later branches
 *         append their own gates here — forgetting to register is visible in the diff.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THIS_FILE = fileURLToPath(import.meta.url);

export interface Gate {
  id: string;
  command: string;
  args: string[];
  /** When true, a non-zero exit is reported but does not fail the aggregate. */
  advisory?: boolean;
}

/** Gates owned by the current stack tip. Later branches append. */
export const GATES: Gate[] = [
  {
    id: 'terminology-allowlist (verify/check-terminology.mjs)',
    command: 'node',
    args: ['verify/check-terminology.mjs'],
  },
  {
    id: 'ucum-units (verify/check-units.mjs)',
    command: 'node',
    args: ['verify/check-units.mjs'],
  },
  {
    id: 'module-headers (verify/check-headers.ts)',
    command: 'pnpm',
    args: ['exec', 'tsx', 'verify/check-headers.ts'],
  },
  {
    id: 'docs-integrity (verify/check-docs.ts)',
    command: 'pnpm',
    args: ['exec', 'tsx', 'verify/check-docs.ts'],
  },
  {
    id: 'snomed-boundary (verify/check-snomed-boundary.ts)',
    command: 'pnpm',
    args: ['exec', 'tsx', 'verify/check-snomed-boundary.ts'],
  },
  {
    id: 'terminology-review-records (verify/check-terminology.ts) [ADVISORY]',
    command: 'pnpm',
    args: ['exec', 'tsx', 'verify/check-terminology.ts'],
    advisory: true,
  },
  {
    id: 'canary-suite (verify/check-canaries.ts)',
    command: 'pnpm',
    args: ['exec', 'tsx', 'verify/check-canaries.ts'],
  },
  {
    id: 'verify-ci-equivalence (verify/check-verify-equivalence.ts)',
    command: 'pnpm',
    args: ['exec', 'tsx', 'verify/check-verify-equivalence.ts'],
  },
];

function main(): void {
  const results: { id: string; exitCode: number; advisory?: boolean }[] = [];

  console.log('run-verify: executing every registered gate (no short-circuit)\n');

  for (const gate of GATES) {
    console.log(`── ${gate.id} ──`);
    const r = spawnSync(gate.command, gate.args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    const code = r.status ?? 1;
    results.push({ id: gate.id, exitCode: code, advisory: gate.advisory });
    console.log(
      `── end ${gate.id} (exit ${code}${gate.advisory ? ', advisory' : ''}) ──\n`,
    );
  }

  console.log('════════════════════════════════════════');
  console.log('verify aggregate');
  console.log('════════════════════════════════════════');
  for (const r of results) {
    const tag = r.exitCode === 0 ? 'PASS' : r.advisory ? 'FAIL(advisory)' : 'FAIL';
    console.log(`  ${tag}  ${r.id}`);
  }
  const blockingFailed = results.filter((r) => r.exitCode !== 0 && !r.advisory);
  const advisoryFailed = results.filter((r) => r.exitCode !== 0 && r.advisory);
  console.log(
    `\nsummary: ${results.length - blockingFailed.length - advisoryFailed.length} passed / ${blockingFailed.length} blocking-failed / ${advisoryFailed.length} advisory-failed / ${results.length} total`,
  );
  if (blockingFailed.length) process.exit(1);
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && resolve(process.argv[1]) === resolve(THIS_FILE);
if (invokedDirectly) {
  main();
}
