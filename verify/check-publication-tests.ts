/**
 * WHAT: Exercises publication refusal for empty artifacts, forbidden codings and invalid package selection.
 * NOT: Does not publish packages or replace scanning the actual release tarball.
 * GOVERNED BY: DECISIONS.md#d14; docs/findings/verify-baseline.md
 * CORRECTNESS: Synthetic negative controls for the publication boundary.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { selectPackages } from './check-package-artifacts.ts';
import { scanPublication } from './check-snomed-boundary.ts';

const root = mkdtempSync(join(tmpdir(), 'open-twin-publication-test-'));
try {
  assert.throws(() => scanPublication([root]), /no text artifacts/);
  assert.throws(() => scanPublication([join(root, 'missing')]), /no text artifacts/);
  const file = join(root, 'artifact.json');
  for (const coding of [
    { system: 'http://snomed.info/sct', code: '123456789' },
    { code: '123456789', system: 'http://snomed.info/sct' }
  ]) {
    writeFileSync(file, JSON.stringify(coding));
    assert.ok(scanPublication([root]).offenders.length > 0);
  }
  writeFileSync(file, JSON.stringify({ system: 'http://loinc.org', code: '93832-4' }));
  assert.equal(scanPublication([root]).offenders.length, 0);
  assert.equal(scanPublication([root]).scanned, 1);
  for (const [directory, name, privatePackage] of [
    ['wearables', '@open-twin/open-wearables', false],
    ['internal', '@open-twin/internal', true]
  ] as const) {
    const path = join(root, 'packages', directory);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'package.json'), JSON.stringify({ name, private: privatePackage }));
  }
  assert.equal(selectPackages(root, '@open-twin/open-wearables').length, 1);
  for (const name of ['@open-twin/provider-open-wearables', '@open-twin/internal', '@open-twin/*']) {
    assert.throws(() => selectPackages(root, name), /exactly one/);
  }
  const repository = join(import.meta.dirname, '..');
  const publish = parse(readFileSync(join(repository, '.github/workflows/publish.yml'), 'utf8'));
  const verify = parse(readFileSync(join(repository, '.github/workflows/verify.yml'), 'utf8'));
  assert.deepEqual(
    [...publish.on.workflow_dispatch.inputs.package.options].sort(),
    selectPackages(repository)
      .map((pkg) => pkg.name)
      .sort()
  );
  assert.equal(publish.jobs.verification.uses, './.github/workflows/verify.yml');
  assert.ok(publish.jobs.publish.needs.includes('verification'));
  assert.ok(Object.hasOwn(verify.on, 'workflow_call'));
  const gateCommands = verify.jobs.gates.steps.map((step: { run?: string }) => step.run ?? '');
  const build = gateCommands.indexOf('pnpm -r build');
  const pack = gateCommands.indexOf('pnpm exec tsx verify/check-package-artifacts.ts');
  const boundary = gateCommands.indexOf('pnpm exec tsx verify/check-snomed-boundary.ts');
  assert.ok(build >= 0 && build < pack && build < boundary);
  const releaseCommands = publish.jobs.publish.steps.map((step: { run?: string }) => step.run ?? '');
  const packRelease = releaseCommands.findIndex((command: string) => command.includes('check-package-artifacts.ts'));
  const publishRelease = releaseCommands.indexOf(
    'npm publish "$RUNNER_TEMP/open-twin-release/package.tgz" --access public --ignore-scripts'
  );
  assert.ok(packRelease >= 0 && publishRelease > packRelease);
  console.log('check-publication-tests: empty scans, forbidden codings and invalid package selections rejected');
  console.log('check-publication-tests: release workflow requires verification and publishes the checked tarball');
} finally {
  rmSync(root, { recursive: true, force: true });
}
