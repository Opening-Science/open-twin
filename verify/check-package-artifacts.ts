/**
 * WHAT: Packs publishable workspace packages and checks the exact tarball contents before release.
 * NOT: Does not publish packages or establish third-party licensing permission.
 * GOVERNED BY: DECISIONS.md#d14; docs/findings/verify-baseline.md
 * CORRECTNESS: Publication regression checks and the SNOMED boundary scanner.
 */
import { execFileSync } from 'node:child_process';
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPublication } from './check-snomed-boundary.ts';

const ROOT = join(import.meta.dirname, '..');

export function selectPackages(root: string, requested?: string): Array<{ name: string; path: string }> {
  const packages = readdirSync(join(root, 'packages')).flatMap((directory) => {
    const path = join(root, 'packages', directory);
    const manifestPath = join(path, 'package.json');
    if (!existsSync(manifestPath)) return [];
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return manifest.private === true ? [] : [{ name: manifest.name as string, path }];
  });
  const selected = requested === undefined ? packages : packages.filter((pkg) => pkg.name === requested);
  if (selected.length === 0 || (requested !== undefined && selected.length !== 1)) {
    throw new Error('Select exactly one existing, publishable package by its complete package name.');
  }
  return selected;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 4 || args[0] !== '--package' || args[2] !== '--out')) {
    throw new Error('Usage: check-package-artifacts.ts [--package NAME --out DIRECTORY]');
  }
  const requested = args[1];
  const output = args[3] ? resolve(args[3]) : undefined;
  const selected = selectPackages(ROOT, requested);
  const temporary = mkdtempSync(join(tmpdir(), 'open-twin-pack-'));
  try {
    for (const [position, pkg] of selected.entries()) {
      if (!existsSync(join(pkg.path, 'dist', 'index.js'))) throw new Error(`Build ${pkg.name} before packing.`);
      const packed = join(temporary, String(position));
      mkdirSync(packed);
      execFileSync('pnpm', ['pack', '--pack-destination', packed], { cwd: pkg.path, stdio: 'pipe' });
      const tarballs = readdirSync(packed).filter((name) => name.endsWith('.tgz'));
      if (tarballs.length !== 1 || !tarballs[0]) throw new Error(`Expected one tarball for ${pkg.name}.`);
      const tarball = join(packed, tarballs[0]);
      const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
      if (entries.some((entry) => !entry.startsWith('package/') || entry.split('/').includes('..'))) {
        throw new Error('Unexpected archive path.');
      }
      const extracted = join(packed, 'contents');
      mkdirSync(extracted);
      execFileSync('tar', ['-xzf', tarball, '-C', extracted]);
      const manifest = JSON.parse(readFileSync(join(extracted, 'package', 'package.json'), 'utf8'));
      if (manifest.name !== pkg.name || !existsSync(join(extracted, 'package', 'dist', 'index.js'))) {
        throw new Error('Packed package identity or built entry point is missing.');
      }
      const result = scanPublication([extracted]);
      if (result.offenders.length) throw new Error(result.offenders.join('\n'));
      console.log(`check-package-artifacts: ${pkg.name}: checked ${result.scanned} packed text files`);
      if (output) {
        mkdirSync(output, { recursive: true });
        const destination = join(output, 'package.tgz');
        if (existsSync(destination)) throw new Error('Release destination already exists; use a fresh directory.');
        copyFileSync(tarball, destination, constants.COPYFILE_EXCL);
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
