/**
 * WHAT: Runs every registered verify gate, prints each result, exits non-zero only on blocking failures.
 * NOT:  Does not short-circuit after the first failure — the baseline needs the full picture.
 * GOVERNED BY: docs/findings/verify-baseline.md; package.json verify script
 * CORRECTNESS: NONE — orchestrator only; each gate names its own authority
 * GOTCHA: Later branches append gates here (often as advisory first) — forgetting
 *         to register is visible in the diff. module-headers is blocking on this tip.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Gate {
  id: string;
  command: string;
  args: string[];
  /** When true, a non-zero exit is reported but does not fail the aggregate. */
  advisory?: boolean;
}

/** Only gates owned by the current branch stack tip. Later branches append. */
const GATES: Gate[] = [
  {
    id: 'terminology-allowlist (verify/check-terminology.mjs)',
    command: 'node',
    args: ['verify/check-terminology.mjs']
  },
  {
    id: 'ucum-units (verify/check-units.mjs)',
    command: 'node',
    args: ['verify/check-units.mjs']
  },
  {
    id: 'module-headers (verify/check-headers.ts)',
    command: 'pnpm',
    args: ['exec', 'tsx', 'verify/check-headers.ts']
  },
  {
    id: 'docs-integrity (verify/check-docs.ts)',
    command: 'pnpm',
    args: ['exec', 'tsx', 'verify/check-docs.ts']
  }
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
      shell: process.platform === 'win32'
    });
    const code = r.status ?? 1;
    results.push({ id: gate.id, exitCode: code, advisory: gate.advisory });
    console.log(`── end ${gate.id} (exit ${code}${gate.advisory ? ', advisory' : ''}) ──\n`);
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
    `\nsummary: ${results.length - blockingFailed.length - advisoryFailed.length} passed / ${blockingFailed.length} blocking-failed / ${advisoryFailed.length} advisory-failed / ${results.length} total`
  );
  if (blockingFailed.length) process.exit(1);
}

main();
