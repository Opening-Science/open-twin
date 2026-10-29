/**
 * WHAT: Runs every blocking job of .github/workflows/verify.yml on this machine, in CI order, and prints one aggregate.
 * NOT:  Does not replace CI — it runs on your Node and OS, not ubuntu-latest + Node 22, and the
 *       tx.fhir.org terminology tier only runs with --tx (CI treats it as advisory too).
 * GOVERNED BY: .github/workflows/verify.yml; verify/run-verify.ts (gate list is reused, not copied)
 * CORRECTNESS: NONE — orchestrator only; each gate and the HL7 validator name their own authority
 * GOTCHA: The validator flags below mirror the workflow by hand. Change them in both places.
 *         A missing `java` is a failure, not a skip — pass --no-validator to skip on purpose.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = join(ROOT, '.github/workflows/verify.yml');
const CACHE = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'open-twin');

const argv = new Set(process.argv.slice(2));
if (argv.has('--help') || argv.has('-h')) {
  console.log(`usage: pnpm ci:local [--no-install] [--no-validator] [--tx]

  --no-install    skip \`pnpm install --frozen-lockfile\`
  --no-validator  skip the HL7 FHIR validator (needs java 21); reported as SKIPPED
  --tx            also run the advisory tx.fhir.org terminology tier (network)`);
  process.exit(0);
}

/** Read from the workflow so a validator bump in CI is picked up here without an edit. */
function validatorVersion(): string {
  const m = readFileSync(WORKFLOW, 'utf8').match(/^\s*VALIDATOR_VERSION:\s*([\w.-]+)\s*$/m);
  if (!m?.[1]) throw new Error(`VALIDATOR_VERSION not found in ${WORKFLOW}`);
  return m[1];
}

/** pnpm sets npm_execpath when it runs a script; fall back to PATH otherwise. */
function pnpm(...args: string[]): [string, string[]] {
  const execpath = process.env.npm_execpath;
  return execpath && /pnpm/.test(execpath) ? [process.execPath, [execpath, ...args]] : ['pnpm', args];
}

function run(command: string, args: string[]): number {
  const r = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.error) console.error(`  ${command}: ${r.error.message}`);
  return r.status ?? 1;
}

function hasJava(): boolean {
  return spawnSync('java', ['-version'], { stdio: 'ignore' }).status === 0;
}

function fetchValidator(version: string): string | undefined {
  const dir = join(CACHE, 'validator', version);
  const jar = join(dir, 'validator_cli.jar');
  if (existsSync(jar)) return jar;
  mkdirSync(dir, { recursive: true });
  const url = `https://github.com/hapifhir/org.hl7.fhir.core/releases/download/${version}/validator_cli.jar`;
  console.log(`  fetching ${url}`);
  return run('curl', ['-fsSL', '-o', jar, url]) === 0 ? jar : undefined;
}

function validate(jar: string, tx: string[]): number {
  const bundles = readdirSync(join(ROOT, 'out'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => join('out', f));
  return run('java', [
    '-jar',
    jar,
    ...bundles,
    '-version',
    '4.0.1',
    '-ig',
    'verify/conformance/generated',
    ...tx,
    '-best-practice',
    'ignore',
    '-jurisdiction',
    'uv',
    '-output-style',
    'eslint-compact',
    '-level',
    'errors'
  ]);
}

type Outcome = 'PASS' | 'FAIL' | 'FAIL(advisory)' | 'SKIPPED';
interface Stage {
  id: string;
  /** Mirrors the CI job the stage reproduces. */
  job: string;
  advisory?: boolean;
  skip?: string;
  exec: () => number;
}

const version = validatorVersion();
let jar: string | undefined;

const STAGES: Stage[] = [
  {
    id: 'install (frozen lockfile)',
    job: 'all',
    skip: argv.has('--no-install') ? '--no-install' : undefined,
    exec: () => run(...pnpm('install', '--frozen-lockfile'))
  },
  { id: 'lint (biome ci)', job: 'tests', exec: () => run(...pnpm('lint')) },
  { id: 'build (pnpm -r build)', job: 'all', exec: () => run(...pnpm('-r', 'build')) },
  { id: 'verify gates (verify/run-verify.ts)', job: 'gates', exec: () => run(...pnpm('verify')) },
  { id: 'type check (every package)', job: 'tests', exec: () => run(...pnpm('typecheck')) },
  { id: 'test (every package)', job: 'tests', exec: () => run(...pnpm('test')) },
  {
    id: 'conformance resources + bundles',
    job: 'fhir-validate',
    skip: argv.has('--no-validator') ? '--no-validator' : undefined,
    exec: () => run('node', ['verify/build-conformance.mjs']) || run(...pnpm('emit-bundles', 'out/'))
  },
  {
    id: `HL7 validator ${version} (structure, offline)`,
    job: 'fhir-validate',
    skip: argv.has('--no-validator') ? '--no-validator' : undefined,
    exec: () => {
      if (!hasJava()) {
        console.error('  java not found — install a JDK 21 (CI uses temurin 21), or pass --no-validator');
        return 1;
      }
      jar = fetchValidator(version);
      return jar ? validate(jar, ['-tx', 'n/a']) : 1;
    }
  },
  {
    id: 'HL7 validator (terminology, tx.fhir.org)',
    job: 'fhir-terminology',
    advisory: true,
    skip: !argv.has('--tx') ? 'pass --tx' : argv.has('--no-validator') ? '--no-validator' : undefined,
    exec: () => (jar ? validate(jar, ['-tx', 'https://tx.fhir.org', '-txCache', join(CACHE, 'tx-cache')]) : 1)
  }
];

const major = Number(process.versions.node.split('.')[0]);
if (major !== 22) {
  console.warn(`ci-local: Node ${process.versions.node} — CI runs Node 22; results can differ.\n`);
}

const results: { stage: Stage; outcome: Outcome; reason?: string }[] = [];
let blocked = false;
for (const stage of STAGES) {
  if (stage.skip || blocked) {
    results.push({ stage, outcome: 'SKIPPED', reason: stage.skip ?? 'an earlier blocking stage failed' });
    continue;
  }
  console.log(`\n══ ${stage.id} [${stage.job}] ══`);
  const code = stage.exec();
  const outcome: Outcome = code === 0 ? 'PASS' : stage.advisory ? 'FAIL(advisory)' : 'FAIL';
  results.push({ stage, outcome });
  // Install and build failures make every later stage meaningless; the rest keep going
  // so one run shows the full picture, as run-verify.ts does.
  if (outcome === 'FAIL' && (stage.id.startsWith('install') || stage.id.startsWith('build'))) blocked = true;
}

console.log('\n════════════════════════════════════════');
console.log('ci-local aggregate');
console.log('════════════════════════════════════════');
for (const r of results) {
  console.log(`  ${r.outcome.padEnd(14)} ${r.stage.id}${r.reason ? ` (${r.reason})` : ''}`);
}
const failed = results.filter((r) => r.outcome === 'FAIL').length;
const skipped = results.filter((r) => r.outcome === 'SKIPPED' && !r.stage.advisory).length;
console.log(
  `\nsummary: ${failed} blocking-failed / ${skipped} blocking-skipped / ${results.length} stages` +
    (skipped ? '\nA skipped blocking stage means this run does NOT match CI.' : '')
);
process.exit(failed ? 1 : 0);
