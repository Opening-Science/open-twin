/**
 * WHAT: Fails when the gate set in verify/run-verify.ts diverges from the CI verify job.
 * NOT:  Does not run the gates — only compares registration lists so local and CI cannot drift.
 * GOVERNED BY: docs/findings/verify-baseline.md
 * CORRECTNESS: NONE — meta-gate; prevents the short-circuit / missing-gate failure mode
 * GOTCHA: Parses workflow YAML lightly (run: lines). A structural CI redesign must update this checker.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATES } from './run-verify.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = join(ROOT, '.github/workflows/verify.yml');

function normalizeInvocation(command: string, args: string[]): string {
  const parts = [command, ...args].map((p) => p.trim()).filter(Boolean);
  if (parts[0] === 'pnpm' && parts[1] === 'exec') {
    return parts.slice(2).join(' ');
  }
  return parts.join(' ');
}

function localGateInvocations(): string[] {
  return GATES.map((g) => normalizeInvocation(g.command, g.args)).sort();
}

function ciGateInvocations(): string[] {
  const yaml = readFileSync(WORKFLOW, 'utf8');
  // Only the `gates:` job — other jobs may re-invoke allowlist/units for status
  // reporting and must not widen the required local set.
  const job = yaml.match(/^ {2}gates:\n([\s\S]*?)(?=^ {2}[a-zA-Z0-9_-]+:|Z)/m);
  const body = job?.[1] ?? '';
  const found = new Set<string>();
  for (const m of body.matchAll(/^\s*run:\s*(.+)$/gm)) {
    let cmd = (m[1] ?? '').trim();
    if (cmd === '|') continue; // multiline block — not a single-line gate
    if (!cmd.includes('verify/check-') && !cmd.includes('verify/run-verify')) {
      continue;
    }
    cmd = cmd.replace(/^pnpm\s+exec\s+/, '');
    found.add(cmd);
  }
  return [...found].sort();
}

const local = localGateInvocations();
const ci = ciGateInvocations();

const localSet = new Set(local);
const ciSet = new Set(ci);

const onlyLocal = local.filter((x) => !ciSet.has(x));
const onlyCi = ci.filter((x) => !localSet.has(x));

console.log('check-verify-equivalence:');
console.log(`  local run-verify gates: ${local.length}`);
for (const x of local) console.log(`    L ${x}`);
console.log(`  CI verify/check-* run steps: ${ci.length}`);
for (const x of ci) console.log(`    C ${x}`);

if (onlyLocal.length || onlyCi.length) {
  console.error('\nFAIL: local verify and CI gate sets diverge');
  for (const x of onlyLocal) console.error(`  only in run-verify.ts: ${x}`);
  for (const x of onlyCi) console.error(`  only in CI workflow: ${x}`);
  console.error('Register every gate in both places (or drop it from both). This is what hid canary findings locally.');
  process.exit(1);
}

console.log('PASS: local run-verify and CI invoke the same verify/check-* gate set');
