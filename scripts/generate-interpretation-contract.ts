/**
 * WHAT: Copies the interpretation-contract JSON Schema into the publishable package and generates TypeScript types from it.
 * NOT:  Does not invent SystemId values, write interpreter rules, or alter the schema.
 * GOVERNED BY: DECISIONS.md#d12; docs/contracts/interpretation-contract.v0.2.schema.json
 * CORRECTNESS: NONE — generation only; conformance is packages/interpretation-contract
 * GOTCHA: `generate --check` compares committed artifacts to the docs schema before writing.
 *         Plain `generate` (used by build) still writes; CI must run `--check` or drift is invisible.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_SRC = join(ROOT, 'docs/contracts/interpretation-contract.v0.2.schema.json');
const PKG = join(ROOT, 'packages/interpretation-contract');
const SCHEMA_DST = join(PKG, 'schema/interpretation-contract.v0.2.schema.json');
const TYPES_DST = join(PKG, 'src/generated/interpretation-contract.v0.2.ts');

const checkOnly = process.argv.includes('--check');

const BANNER = `/**
 * GENERATED from docs/contracts/interpretation-contract.v0.2.schema.json — do not edit.
 * Regenerate: pnpm --filter @open-twin/interpretation-contract generate
 */
`;

async function main(): Promise<void> {
  const types = await compileFromFile(SCHEMA_SRC, {
    bannerComment: BANNER,
    unreachableDefinitions: true,
    additionalProperties: false,
    style: { singleQuote: true, semi: true }
  });

  if (checkOnly) {
    const failures: string[] = [];
    if (!existsSync(SCHEMA_DST)) {
      failures.push(`missing committed schema copy: ${SCHEMA_DST}`);
    } else {
      const src = readFileSync(SCHEMA_SRC);
      const dst = readFileSync(SCHEMA_DST);
      if (!src.equals(dst)) {
        failures.push(
          'packages/interpretation-contract/schema/… drifted from docs/contracts/interpretation-contract.v0.2.schema.json'
        );
      }
    }
    if (!existsSync(TYPES_DST)) {
      failures.push(`missing committed generated types: ${TYPES_DST}`);
    } else {
      const committed = readFileSync(TYPES_DST, 'utf8');
      if (committed !== types) {
        failures.push(
          'packages/interpretation-contract/src/generated/… drifted from schema — run pnpm --filter @open-twin/interpretation-contract generate'
        );
      }
    }
    if (failures.length) {
      for (const f of failures) console.error(f);
      process.exit(1);
    }
    console.log('generate --check: schema copy and generated types match docs source');
    return;
  }

  mkdirSync(dirname(SCHEMA_DST), { recursive: true });
  mkdirSync(dirname(TYPES_DST), { recursive: true });
  copyFileSync(SCHEMA_SRC, SCHEMA_DST);
  writeFileSync(TYPES_DST, types, 'utf8');
  console.log(`Wrote ${SCHEMA_DST}`);
  console.log(`Wrote ${TYPES_DST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
