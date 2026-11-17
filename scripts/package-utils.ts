/**
 * WHAT: Shared package inventory and checked command execution for publication tooling.
 * NOT: Does not publish packages or alter clinical outputs.
 * GOVERNED BY: docs/PUBLISHING.md
 * CORRECTNESS: NONE — packaging checks only
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_NAMES = [
  'aggregate',
  'fhir-core',
  'fhir-r4',
  'genomics-vcf',
  'hl7v2',
  'open-wearables',
  'provider-google-health',
  'provider-oura',
  'provider-vitronic',
  'provider-whoop',
  'reader-core'
].map((name) => `@open-twin/${name}`);
export const REPOSITORY = 'https://github.com/Opening-Science/open-twin';

export interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  type?: string;
  main?: string;
  types?: string;
  license?: string;
  exports?: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  repository?: { type: string; url: string; directory: string };
  homepage?: string;
  bugs?: { url: string };
  publishConfig?: { access: string };
}

export function readManifest(directory: string): Manifest {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
}

export function packages(root = ROOT): { directory: string; manifest: Manifest }[] {
  return readdirSync(join(root, 'packages')).map((directory) => {
    const path = join(root, 'packages', directory);
    return { directory: path, manifest: readManifest(path) };
  });
}

export function publicPackages(root = ROOT): ReturnType<typeof packages> {
  const result = packages(root).filter(({ manifest }) => !manifest.private);
  assert.deepEqual(
    result.map(({ manifest }) => manifest.name).sort(),
    [...PUBLIC_NAMES].sort(),
    'Unexpected public package set; review publication boundaries explicitly'
  );
  return result;
}

export function command(executable: string, args: string[], cwd = ROOT, env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 300_000,
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${executable} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
