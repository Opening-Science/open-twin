/**
 * WHAT: Fails the build when registry/connectors.json and the workspace disagree: a package without an entry or an entry without a package, a version that differs from package.json, a verification bundle or path that does not exist, a reader whose descriptor differs from its entry, or generated files that are stale.
 * NOT:  Does not run readers or validate bundles; the conformance suite and the HL7 validator do that.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: runs after `pnpm -r build` in CI and in run-verify, because it imports each registered package's dist to compare descriptors.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkDescriptor,
  descriptorOf,
  loadRegistry,
  type RegistryEntry,
  resolveReader
} from '../packages/reader-core/src/index.ts';
import { staleRegistryFiles } from '../scripts/generate-registry-docs.ts';
import { BUNDLE_CASES } from './bundles.manifest.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Packages that are not ingestion-layer connectors (D14) and so have no registry entry.
 * A new package that is not listed here must have an entry, or this gate fails.
 */
const NOT_A_CONNECTOR = new Set([
  '@open-twin/fhir-core',
  '@open-twin/aggregate',
  '@open-twin/reader-core',
  '@open-twin/anchor-layer',
  '@open-twin/interpreter',
  '@open-twin/interpretation-contract'
]);

interface WorkspacePackage {
  name: string;
  version: string;
  dir: string;
  /** The built entry point from the exports map, relative to the package. */
  entry: string;
}

function workspacePackages(): WorkspacePackage[] {
  const out: WorkspacePackage[] = [];
  for (const name of readdirSync(join(ROOT, 'packages'))) {
    const manifest = join(ROOT, 'packages', name, 'package.json');
    if (!existsSync(manifest)) continue;
    const json = JSON.parse(readFileSync(manifest, 'utf8')) as {
      name: string;
      version: string;
      exports?: Record<string, { import?: string }>;
    };
    out.push({
      name: json.name,
      version: json.version,
      dir: `packages/${name}`,
      entry: json.exports?.['.']?.import ?? 'dist/index.js'
    });
  }
  return out;
}

async function checkEntry(entry: RegistryEntry, pkg: WorkspacePackage, bundleNames: Set<string>): Promise<string[]> {
  const problems: string[] = [];
  if (entry.version !== pkg.version) {
    problems.push(`${entry.id}: version ${entry.version} but ${pkg.dir}/package.json says ${pkg.version}`);
  }
  for (const name of entry.verificationBundles) {
    if (!bundleNames.has(name))
      problems.push(`${entry.id}: verification bundle "${name}" is not in verify/bundles.manifest.ts`);
  }
  for (const field of ['docs', 'fixtures', 'fixturesProvenance'] as const) {
    const path = entry[field];
    if (path && !existsSync(join(ROOT, path))) problems.push(`${entry.id}: ${field} path "${path}" does not exist`);
  }
  if (!entry.docs.startsWith(`${pkg.dir}/`)) problems.push(`${entry.id}: docs path is not under ${pkg.dir}`);
  if (entry.export) {
    try {
      const reader = await resolveReader(entry, () => import(pathToFileURL(join(ROOT, pkg.dir, pkg.entry)).href));
      problems.push(...checkDescriptor(reader, descriptorOf(entry)).map((v) => `${entry.id}: ${v}`));
    } catch (error) {
      problems.push(`${entry.id}: could not resolve ${entry.export} from ${pkg.dir}/${pkg.entry} (${String(error)})`);
    }
  }
  return problems;
}

async function main(): Promise<void> {
  const problems: string[] = [];
  const registry = loadRegistry(join(ROOT, 'registry', 'connectors.json'));
  const packages = workspacePackages();
  const byName = new Map(packages.map((p) => [p.name, p]));
  const bundleNames = new Set(BUNDLE_CASES.map((c) => c.name));

  for (const name of NOT_A_CONNECTOR) {
    if (!byName.has(name)) problems.push(`NOT_A_CONNECTOR names ${name}, which is not in the workspace`);
  }
  for (const pkg of packages) {
    if (NOT_A_CONNECTOR.has(pkg.name)) continue;
    if (!registry.entries.some((e) => e.package === pkg.name)) {
      problems.push(`${pkg.dir} (${pkg.name}) has no entry in registry/connectors.json`);
    }
  }
  for (const entry of registry.entries) {
    const pkg = byName.get(entry.package);
    if (!pkg) {
      problems.push(`${entry.id}: package ${entry.package} is not in the workspace`);
      continue;
    }
    if (NOT_A_CONNECTOR.has(pkg.name)) problems.push(`${entry.id}: ${pkg.name} is not a connector package`);
    problems.push(...(await checkEntry(entry, pkg, bundleNames)));
  }
  for (const path of staleRegistryFiles(ROOT)) {
    problems.push(`${path} is stale; run \`pnpm exec tsx scripts/generate-registry-docs.ts\``);
  }

  const adapters = registry.entries.filter((e) => e.export).length;
  if (problems.length > 0) {
    console.error(`check-registry: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(
    `check-registry: ok (${registry.entries.length} entries, ${adapters} with a reader adapter, ${registry.entries.length - adapters} pending)`
  );
}

main().catch((error: unknown) => {
  console.error(`check-registry: ${String(error)}`);
  process.exit(1);
});
