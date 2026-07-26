#!/usr/bin/env tsx
/**
 * Records what the HL7 reference validator says about every fixture in this package.
 *
 * The output, `src/tests/oracle/oracle-verdicts.json`, is the oracle the unit tests
 * compare against. Two things follow from that and both are the point:
 *
 *  - Where this package flags a bundle and the validator does not, the disagreement
 *    is written down rather than argued about. There are six such fixtures. In five
 *    the validator is right that the resource is conformant FHIR and the finding is
 *    open-twin policy; in the sixth it cannot check at all, because `-tx n/a` leaves
 *    it without a terminology server.
 *  - Where the validator flags something this package does not, the test fails. The
 *    validator is the authority; this package is not.
 *
 * The recorded messages quote the fixtures, which are synthetic bundles written for
 * this repository. No runtime path ever puts input into a message — see `issues.ts`.
 *
 *   OT_HL7_VALIDATOR_JAR=/path/to/validator_cli.jar pnpm --filter @open-twin/fhir-r4 oracle
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseBundle } from '../src/normalise/normalise';
import { HL7_LIPIDS_BUNDLE } from '../src/samples/hl7-lipids-bundle';
import { INVALID_FIXTURES, VALID_BASELINE } from '../src/tests/fixtures/invalid-bundles';
import { fhirR4IngestBundle } from '../src/verification/exampleBundle';

// biome-ignore lint/suspicious/noConsole: a command-line tool whose output is the product
const say = (message: string): void => console.log(message);
// biome-ignore lint/suspicious/noConsole: a command-line tool whose output is the product
const fail = (message: string): void => console.error(message);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const OUT = join(HERE, '..', 'src', 'tests', 'oracle', 'oracle-verdicts.json');

const jar = process.env.OT_HL7_VALIDATOR_JAR ?? process.argv[2];
if (!jar) {
  fail('FAIL: set OT_HL7_VALIDATOR_JAR, or pass the path to validator_cli.jar as the first argument.');
  process.exit(1);
}

const ig = join(REPO_ROOT, 'verify', 'conformance', 'generated');
try {
  readFileSync(join(ig, 'CodeSystem-connector.json'));
} catch {
  fail(`FAIL: no generated conformance resources at ${ig}. Run \`node verify/build-conformance.mjs\` first.`);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'ot-fhir-r4-oracle-'));

const lipids = normaliseBundle(HL7_LIPIDS_BUNDLE, {
  connector: { connector: 'fhir-r4', version: '0.1.0' },
  subjectKey: 'hl7-example-pat2',
  timestamp: '2026-07-26T10:00:00Z',
  bundleKey: 'fhir-r4-hl7-lipids'
});

const cases: Array<{ name: string; bundle: unknown }> = [
  { name: 'valid-baseline', bundle: VALID_BASELINE },
  // The bundle registered in verify/bundles.manifest.ts. It has to come back clean.
  { name: 'normalised-hl7-vitals', bundle: fhirR4IngestBundle() },
  // Not registered, and recorded so the reason is on the record rather than in
  // somebody's memory: HL7's own `Bundle-lipids` example carries
  // `Identifier.system: http://acme.com/lab/reports`, which the validator rejects as
  // an example URL. Normalisation does not touch it — rewriting an identifier system
  // to please a validator is exactly the silent corruption this package refuses to do.
  { name: 'normalised-hl7-lipids', bundle: lipids.bundle },
  ...INVALID_FIXTURES.map((fixture) => ({ name: fixture.name, bundle: fixture.bundle }))
];

const files = cases.map(({ name, bundle }) => {
  const path = join(dir, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`);
  return path;
});

/**
 * The validator exits non-zero whenever it finds an error, which is most of the
 * time here — every fixture in the set is meant to be broken. The exit code carries
 * no information the parsed output does not, so it is the output that is read.
 */
function runValidator(args: string[]): string {
  try {
    return execFileSync('java', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    if (typeof stdout === 'string' && stdout.length > 0) return stdout;
    throw error;
  }
}

const output = runValidator([
  '-jar',
  jar,
  ...files,
  '-version',
  '4.0.1',
  '-ig',
  ig,
  '-tx',
  'n/a',
  '-best-practice',
  'ignore',
  '-jurisdiction',
  'uv',
  '-output-style',
  'compact',
  '-level',
  'errors'
]);

/** `[2, 41] Bundle.entry[0].fullUrl: Error - UUIDs must be valid and lowercase (...)` */
const ISSUE = /^\[[^\]]*\]\s+(.*?):\s+(Fatal|Error|Warning|Information)\s+-\s+([\s\S]*)$/;
const HEADER = /^(\S+\.json)\s+\d{2}:\d{2}:\d{2}$/;

const verdicts: Record<string, { errors: string[] }> = {};
let current: string | undefined;

for (const line of output.split('\n')) {
  const header = HEADER.exec(line.trim());
  if (header?.[1]) {
    current = header[1].slice(header[1].lastIndexOf('/') + 1).replace(/\.json$/, '');
    verdicts[current] = { errors: [] };
    continue;
  }
  if (!current) continue;
  const match = ISSUE.exec(line.trim());
  if (!match) continue;
  const [, expression, severity, message] = match;
  if (severity !== 'Error' && severity !== 'Fatal') continue;
  verdicts[current]?.errors.push(`${expression}: ${message}`);
}

const missing = cases.filter(({ name }) => verdicts[name] === undefined).map(({ name }) => name);
if (missing.length > 0) {
  // A parser that silently produced nothing would record "the validator found no
  // errors anywhere", which is the most dangerous possible wrong answer here.
  fail(`FAIL: no validator section parsed for: ${missing.join(', ')}`);
  fail(output);
  process.exit(1);
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _readme: [
        'Recorded output of the HL7 FHIR validator over this package fixtures.',
        'Regenerate with: OT_HL7_VALIDATOR_JAR=... pnpm --filter @open-twin/fhir-r4 oracle',
        'Flags: -version 4.0.1 -ig verify/conformance/generated -tx n/a -best-practice ignore',
        '       -jurisdiction uv -output-style compact -level errors',
        'An empty errors array means the validator considers the bundle conformant.'
      ],
      verdicts
    },
    null,
    2
  )}\n`
);

for (const [name, verdict] of Object.entries(verdicts)) {
  say(`${verdict.errors.length === 0 ? 'clean' : `${verdict.errors.length} error(s)`}\t${name}`);
}
say(`\nWrote ${OUT}`);
// The recording is JSON.stringify output and biome formats JSON, so a fresh
// recording fails `biome ci` on whitespace alone until it is formatted.
say('Now run `pnpm format`, then `pnpm --filter @open-twin/fhir-r4 test`.');
