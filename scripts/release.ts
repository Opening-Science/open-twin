/**
 * WHAT: Plans independent versions and validates one package before publication.
 * NOT: Does not publish packages, create tags or bypass maintainer approval.
 * GOVERNED BY: docs/PUBLISHING.md
 * CORRECTNESS: NONE — release policy and registry checks only
 */

import assert from 'node:assert/strict';
import { appendFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getReleasePlan } from '@changesets/get-release-plan';
import { inc, major, satisfies, valid } from 'semver';
import { command, type Manifest, PUBLIC_NAMES, packages, publicPackages, ROOT } from './package-utils';
import { verifyReleaseCommit, verifyReleaseTag } from './release-tag';

interface Release {
  name: string;
  type: 'none' | 'patch' | 'minor' | 'major';
  oldVersion: string;
  newVersion: string;
}

interface Plan {
  releases: Release[];
}

function changesets(root: string, args: string[]): string {
  return command(join(ROOT, 'node_modules/.bin/changeset'), args, root);
}

export async function releasePlan(root = ROOT): Promise<{ plan: Plan; promotions: Map<string, 'minor' | 'major'> }> {
  const inventory = publicPackages(root);
  const raw = await getReleasePlan(root);
  const plan: Plan = { releases: raw.releases.filter((release) => release.type !== 'none') };
  assert(
    plan.releases.every((release) => PUBLIC_NAMES.includes(release.name)),
    'Release plan includes a private package'
  );
  const promotions = new Map<string, 'minor' | 'major'>();
  let updated = true;
  while (updated) {
    updated = false;
    for (const { manifest } of inventory) {
      for (const [dependency, range] of Object.entries({
        ...manifest.dependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies
      })) {
        const change = plan.releases.find((release) => release.name === dependency);
        if (!change) continue;
        const current = inventory.find((pkg) => pkg.manifest.name === dependency);
        assert(current, `Missing public dependency ${dependency}`);
        const compatible = range === 'workspace:^' ? `^${current.manifest.version}` : range.replace(/^workspace:/, '');
        if (satisfies(change.newVersion, compatible)) continue;
        const type = major(manifest.version) === 0 ? 'minor' : 'major';
        const existing = plan.releases.find((release) => release.name === manifest.name);
        if (existing?.type === 'major' || (type === 'minor' && existing?.type === 'minor')) continue;
        const newVersion = inc(manifest.version, type);
        assert(newVersion);
        if (existing) Object.assign(existing, { type, newVersion });
        else plan.releases.push({ name: manifest.name, type, oldVersion: manifest.version, newVersion });
        promotions.set(manifest.name, type);
        updated = true;
      }
    }
  }
  return { plan, promotions };
}

export async function versionWorkspace(root = ROOT): Promise<Plan> {
  const { plan, promotions } = await releasePlan(root);
  const privateBefore = packages(root)
    .filter(({ manifest }) => manifest.private)
    .map(({ directory, manifest }) => ({
      directory,
      name: manifest.name,
      version: manifest.version
    }));
  const generated = join(root, '.changeset', 'dependency-compatibility.md');
  assert(!existsSync(generated), `${generated} already exists; choose an unreserved changeset name`);
  try {
    if (promotions.size) {
      writeFileSync(
        generated,
        `---\n${[...promotions].map(([name, type]) => `${JSON.stringify(name)}: ${type}`).join('\n')}\n---\n\nUpdate compatibility for a breaking shared dependency release.\n`
      );
    }
    if (plan.releases.length) changesets(root, ['version']);
    for (const before of privateBefore) {
      const after = packages(root).find(({ manifest }) => manifest.name === before.name)?.manifest;
      assert(after?.private && after.version === before.version, `Private package version changed: ${before.name}`);
    }
    return plan;
  } finally {
    rmSync(generated, { force: true });
  }
}

export function selectPackage(tag: string, root = ROOT): { directory: string; manifest: Manifest } {
  const match = /^(@open-twin\/[a-z0-9-]+)@(\d+\.\d+\.\d+)$/.exec(tag);
  assert(match && valid(match[2]), 'Expected a stable package tag such as @open-twin/provider-oura@0.1.1');
  const selected = publicPackages(root).find(({ manifest }) => manifest.name === match[1]);
  assert(selected, `Unknown or private release package: ${match[1]}`);
  assert.equal(selected.manifest.version, match[2], 'Tag version does not match package.json');
  return selected;
}

export async function selectManualPackage(
  name: string,
  ref: string,
  root = ROOT
): Promise<ReturnType<typeof selectPackage>> {
  assert.equal(ref, 'refs/heads/main', 'Manual publication must run from main');
  const selected = publicPackages(root).find(({ manifest }) => manifest.name === name);
  assert(selected, `Unknown or private release package: ${name}`);
  const validated = selectPackage(`${name}@${selected.manifest.version}`, root);
  assert(
    !(await releasePlan(root)).plan.releases.some((release) => release.name === name),
    `Merge the pending version PR for ${name} before publishing`
  );
  return validated;
}

export async function registryPreflight(
  manifest: Manifest,
  inventory: Manifest[],
  registry = 'https://registry.npmjs.org'
): Promise<void> {
  const url = new URL(registry);
  assert(
    url.origin === 'https://registry.npmjs.org' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'),
    'Only npm or an isolated loopback test registry is allowed'
  );
  assert(PUBLIC_NAMES.includes(manifest.name) && !manifest.private, 'Cannot publish a private/unknown package');
  const response = await fetch(`${registry}/${encodeURIComponent(manifest.name)}`, {
    signal: AbortSignal.timeout(30_000)
  });
  assert(
    response.ok || response.status === 404,
    `Registry lookup failed for ${manifest.name}: HTTP ${response.status}`
  );
  if (response.ok) {
    const metadata: { versions?: Record<string, unknown> } = await response.json();
    assert(metadata.versions, `Missing registry version metadata for ${manifest.name}`);
    assert(
      !Object.hasOwn(metadata.versions, manifest.version),
      `${manifest.name}@${manifest.version} is already published`
    );
  }
  for (const [name, declared] of Object.entries({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies
  })) {
    if (!name.startsWith('@open-twin/')) continue;
    const dependency = inventory.find((entry) => entry.name === name);
    assert(dependency && !dependency.private, `Unknown/private internal dependency ${name}`);
    const range = declared === 'workspace:^' ? `^${dependency.version}` : declared;
    const available = await fetch(`${registry}/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(30_000) });
    assert(available.ok, `Publish a compatible ${name} before ${manifest.name}: HTTP ${available.status}`);
    const metadata: { versions?: Record<string, unknown> } = await available.json();
    assert(
      metadata.versions && Object.keys(metadata.versions).some((version) => satisfies(version, range)),
      `No published ${name} satisfies ${range}; publish the dependency first`
    );
  }
}

async function main(): Promise<void> {
  const [mode, target] = process.argv.slice(2);
  if (mode === 'status') {
    console.log(JSON.stringify((await releasePlan()).plan, null, 2));
  } else if (mode === 'version') {
    console.log(JSON.stringify(await versionWorkspace(), null, 2));
  } else if (mode === 'select' || mode === 'manual' || mode === 'preflight') {
    assert(target, 'A release package or package-specific tag is required');
    const selected =
      mode === 'manual' ? await selectManualPackage(target, process.env.GITHUB_REF ?? '') : selectPackage(target);
    const tag = `${selected.manifest.name}@${selected.manifest.version}`;
    const commit = command('git', ['rev-parse', 'HEAD']).trim();
    if (mode !== 'preflight') {
      verifyReleaseCommit(commit);
      if (mode === 'select') verifyReleaseTag(tag, commit);
    }
    await registryPreflight(
      selected.manifest,
      publicPackages().map(({ manifest }) => manifest)
    );
    if (mode !== 'preflight') {
      assert(process.env.GITHUB_OUTPUT, 'select is intended for the release workflow');
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `package=${selected.manifest.name}\nversion=${selected.manifest.version}\ntag=${tag}\ncommit=${commit}\ntarball=${selected.manifest.name.slice(1).replace('/', '-')}-${selected.manifest.version}.tgz\n`
      );
    }
    console.log(`Registry preflight passed: ${tag}`);
  } else {
    throw new Error('Usage: release.ts status | version | manual <package> | select <tag> | preflight <tag>');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
