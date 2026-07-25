#!/usr/bin/env tsx
/**
 * Writes every registered bundle to a directory so the HL7 validator can check it.
 *
 * Run with tsx, not node: the bundles are built from the connectors' TypeScript
 * sources so they cannot drift from what the library actually emits. A version of
 * this script that read checked-in JSON would validate the fixtures rather than the
 * code, which is the same mistake as a snapshot test asserting its own output.
 *
 *   pnpm emit-bundles out/
 *   java -jar validator_cli.jar out/*.json -version 4.0.1
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BUNDLE_CASES } from './bundles.manifest';

const outDir = resolve(process.argv[2] ?? 'out');
mkdirSync(outDir, { recursive: true });

let failed = 0;
for (const testCase of BUNDLE_CASES) {
  try {
    const bundle = testCase.build();
    const path = join(outDir, `${testCase.name}.json`);
    writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`);
    console.log(`wrote ${path} (${bundle.entry?.length ?? 0} entries)`);
  } catch (error) {
    failed++;
    console.error(`FAILED to build ${testCase.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (BUNDLE_CASES.length === 0) {
  console.error('FAIL: no bundles registered. Refusing to report success on an empty run.');
  process.exit(1);
}

if (failed > 0) process.exit(1);
console.log(`\n${BUNDLE_CASES.length} bundle(s) written to ${outDir}`);
