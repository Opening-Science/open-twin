/**
 * WHAT: Runs every registered verify gate, prints each result, exits non-zero only on the aggregate.
 * NOT:  Does not short-circuit after the first failure — the baseline needs the full picture.
 * GOVERNED BY: docs/findings/verify-baseline.md; package.json verify script
 * CORRECTNESS: NONE — orchestrator only; each gate names its own authority
 * GOTCHA: Later branches register their own gates here. A branch that adds a gate
 *         script but forgets to register it is visible in the diff — deliberate.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Gate {
  id: string;
  command: string;
  args: string[];
}

/** Only gates owned by the current branch stack tip. Later branches append. */
const GATES: Gate[] = [
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
];

function main(): void {
  const results: { id: string; exitCode: number }[] = [];

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
    results.push({ id: gate.id, exitCode: code });
    console.log(`── end ${gate.id} (exit ${code}) ──\n`);
  }

  console.log('════════════════════════════════════════');
  console.log('verify aggregate');
  console.log('════════════════════════════════════════');
  for (const r of results) {
    console.log(`  ${r.exitCode === 0 ? 'PASS' : 'FAIL'}  ${r.id}`);
  }
  const failed = results.filter((r) => r.exitCode !== 0);
  console.log(
    `\nsummary: ${results.length - failed.length} passed / ${failed.length} failed / ${results.length} total`,
  );
  if (failed.length) process.exit(1);
}

main();
