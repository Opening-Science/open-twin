/**
 * WHAT: Writes registry/connectors.schema.json, the connector table in docs/registry.md and the one in README.md from registry/connectors.json; verify/check-registry.ts fails while they are stale.
 * NOT:  Does not validate the registry beyond loading it; verify/check-registry.ts holds the gate rules.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: imports reader-core from source, so it needs `pnpm -r build` first for @open-twin/fhir-core to resolve, like verify/check-canaries.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadRegistry,
  registryJsonSchema,
  renderRegistryTable,
  replaceBetweenMarkers
} from '../packages/reader-core/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = 'scripts/generate-registry-docs.ts';

export interface GeneratedFile {
  path: string;
  content: string;
}

/** The three generated files as they should read for the registry at `root`. */
export function generatedRegistryFiles(root: string = ROOT): GeneratedFile[] {
  const registry = loadRegistry(join(root, 'registry', 'connectors.json'));
  const schema = `${JSON.stringify(registryJsonSchema(), null, 2)}\n`;
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const docs = readFileSync(join(root, 'docs', 'registry.md'), 'utf8');
  return [
    { path: 'registry/connectors.schema.json', content: schema },
    { path: 'README.md', content: replaceBetweenMarkers(readme, renderRegistryTable(registry.entries), GENERATOR) },
    {
      path: 'docs/registry.md',
      content: replaceBetweenMarkers(docs, renderRegistryTable(registry.entries, '../'), GENERATOR)
    }
  ];
}

/** Paths whose committed content differs from the generated one. */
export function staleRegistryFiles(root: string = ROOT): string[] {
  return generatedRegistryFiles(root)
    .filter((file) => {
      try {
        return readFileSync(join(root, file.path), 'utf8') !== file.content;
      } catch {
        return true;
      }
    })
    .map((file) => file.path);
}

function main(): void {
  for (const file of generatedRegistryFiles()) {
    writeFileSync(join(ROOT, file.path), file.content);
    console.log(`wrote ${file.path}`);
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
