/**
 * WHAT: Copies the interpretation-contract JSON Schema into the publishable package and generates TypeScript types from it.
 * NOT:  Does not invent SystemId values, write interpreter rules, or alter the schema.
 * GOVERNED BY: DECISIONS.md#d12; docs/contracts/interpretation-contract.v0.2.schema.json
 * CORRECTNESS: NONE — generation only; conformance is packages/interpretation-contract
 */
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_SRC = join(
  ROOT,
  'docs/contracts/interpretation-contract.v0.2.schema.json',
);
const PKG = join(ROOT, 'packages/interpretation-contract');
const SCHEMA_DST = join(PKG, 'schema/interpretation-contract.v0.2.schema.json');
const TYPES_DST = join(PKG, 'src/generated/interpretation-contract.v0.2.ts');

async function main(): Promise<void> {
  mkdirSync(dirname(SCHEMA_DST), { recursive: true });
  mkdirSync(dirname(TYPES_DST), { recursive: true });
  copyFileSync(SCHEMA_SRC, SCHEMA_DST);

  const banner = `/**
 * GENERATED from docs/contracts/interpretation-contract.v0.2.schema.json — do not edit.
 * Regenerate: pnpm --filter @open-twin/interpretation-contract generate
 */
`;

  const types = await compileFromFile(SCHEMA_SRC, {
    bannerComment: banner,
    unreachableDefinitions: true,
    additionalProperties: false,
    style: { singleQuote: true, semi: true },
  });
  writeFileSync(TYPES_DST, types, 'utf8');

  // Prove the copy matches the docs source of truth.
  const a = readFileSync(SCHEMA_SRC);
  const b = readFileSync(SCHEMA_DST);
  if (!a.equals(b)) {
    throw new Error('schema copy drifted from docs/contracts source');
  }
  console.log(`Wrote ${SCHEMA_DST}`);
  console.log(`Wrote ${TYPES_DST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
