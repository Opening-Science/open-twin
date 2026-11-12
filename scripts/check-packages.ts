/**
 * WHAT: Packs public packages and checks real installs outside the workspace.
 * NOT: Does not publish to npm or call vendor APIs; the staging registry is loopback-only.
 * GOVERNED BY: docs/PUBLISHING.md
 * CORRECTNESS: NONE — runtime, declaration and artifact checks are not clinical validation
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { command, type Manifest, PUBLIC_NAMES, publicPackages, REPOSITORY, ROOT, readManifest } from './package-utils';

interface Artifact {
  manifest: Manifest;
  tarball: string;
  imports: string[];
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function inspect(directory: string, tarball: string, destination: string): Artifact {
  mkdirSync(destination);
  const entries = command('tar', ['-tzf', tarball]).trim().split('\n');
  assert(entries.every((entry) => entry.startsWith('package/') && !entry.split('/').includes('..')));
  command('tar', ['-xzf', tarball, '-C', destination]);
  const packed = join(destination, 'package');
  const manifest = readManifest(packed);
  assert(!manifest.private, `${manifest.name} is private`);
  assert.equal(manifest.license, 'MIT');
  assert.equal(readFileSync(join(packed, 'LICENSE'), 'utf8'), readFileSync(join(ROOT, 'LICENSE'), 'utf8'));
  assert(readFileSync(join(packed, 'README.md'), 'utf8').trim(), 'README is missing or empty');
  assert.equal(manifest.repository?.url, `git+${REPOSITORY}.git`);
  assert.equal(manifest.repository?.directory, relative(ROOT, directory));
  assert.equal(manifest.homepage, `${REPOSITORY}/tree/main/${relative(ROOT, directory)}#readme`);
  assert.equal(manifest.bugs?.url, `${REPOSITORY}/issues`);
  assert.equal(manifest.publishConfig?.access, 'public');
  assert.equal(manifest.type, 'module');
  for (const [name, range] of Object.entries({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies
  })) {
    assert(!/^(workspace:|link:|file:)/.test(range), `${manifest.name}: unresolved dependency ${name}=${range}`);
    if (name.startsWith('@open-twin/')) {
      assert(PUBLIC_NAMES.includes(name), `Private/unknown runtime dependency ${name}`);
      assert(range.startsWith('^'), `Expected a compatible shared dependency range for ${name}`);
    }
  }
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
    assert(!manifest.scripts?.[hook], `${manifest.name}: consumer lifecycle hook ${hook} requires review`);
  }
  const contents = files(packed);
  assert(
    !contents.some((path) => /(?:^|\/)(?:src|tests?|fixtures|node_modules|\.env)(?:\/|$)/.test(relative(packed, path)))
  );
  for (const target of [manifest.main, manifest.types]) {
    assert(target && existsSync(join(packed, target)), `${manifest.name}: missing main/types target`);
  }
  const imports: string[] = [];
  assert(manifest.exports, `${manifest.name}: missing exports`);
  for (const [subpath, conditions] of Object.entries(manifest.exports)) {
    const targets = typeof conditions === 'string' ? { import: conditions } : conditions;
    assert(targets.import && targets.types, `${manifest.name}/${subpath}: missing import/types conditions`);
    const runtime = targets.import;
    const matches = runtime.includes('*')
      ? contents.filter((path) => {
          const target = `./${relative(packed, path)}`;
          return target.startsWith(runtime.split('*')[0]) && target.endsWith(runtime.split('*')[1]);
        })
      : [join(packed, runtime)];
    assert(matches.length, `${manifest.name}: export pattern ${subpath} has no files`);
    for (const path of matches) {
      assert(existsSync(path), `Missing runtime export ${path}`);
      const target = `./${relative(packed, path)}`;
      const wildcard = runtime.includes('*')
        ? target.slice(runtime.split('*')[0].length, -runtime.split('*')[1].length)
        : '';
      for (const condition of Object.values(targets)) {
        assert(existsSync(join(packed, condition.replace('*', wildcard))), `Missing export target ${condition}`);
      }
      imports.push(subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2).replace('*', wildcard)}`);
    }
  }
  if (
    manifest.dependencies?.['@open-twin/fhir-core'] &&
    files(join(directory, 'src')).some(
      (path) => path.endsWith('.ts') && readFileSync(path, 'utf8').includes('@open-twin/fhir-core')
    )
  ) {
    assert(
      contents.some(
        (path) => /\.(js|d\.ts)$/.test(path) && readFileSync(path, 'utf8').includes('@open-twin/fhir-core')
      ),
      `${manifest.name}: core must remain an external package import`
    );
  }
  return { manifest, tarball, imports };
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())));
  return port;
}

async function stage(registry: string, artifact: Artifact): Promise<void> {
  const data = readFileSync(artifact.tarball);
  const filename = basename(artifact.tarball);
  const { manifest } = artifact;
  const response = await fetch(`${registry}/${encodeURIComponent(manifest.name)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      _id: manifest.name,
      name: manifest.name,
      'dist-tags': { latest: manifest.version },
      versions: {
        [manifest.version]: {
          ...manifest,
          dist: {
            shasum: createHash('sha1').update(data).digest('hex'),
            integrity: `sha512-${createHash('sha512').update(data).digest('base64')}`,
            tarball: `${registry}/${manifest.name}/-/${filename}`
          }
        }
      },
      _attachments: {
        [filename]: { content_type: 'application/octet-stream', data: data.toString('base64'), length: data.length }
      }
    }),
    signal: AbortSignal.timeout(30_000)
  });
  assert(response.ok, `Local staging failed for ${manifest.name}: HTTP ${response.status}`);
}

async function main(): Promise<void> {
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  assert(outputIndex < 0 || output, '--output requires a directory');
  const workspace = mkdtempSync(join(tmpdir(), 'open-twin-packages-'));
  const logPath = join(workspace, 'registry.log');
  const log = openSync(logPath, 'w');
  let registryProcess: ReturnType<typeof spawn> | undefined;
  try {
    const artifacts: Artifact[] = [];
    for (const { directory } of publicPackages()) {
      const pack = join(workspace, basename(directory));
      mkdirSync(pack);
      command('pnpm', ['pack', '--pack-destination', pack], directory);
      const tarballs = readdirSync(pack).filter((file) => file.endsWith('.tgz'));
      assert.equal(tarballs.length, 1);
      artifacts.push(inspect(directory, join(pack, tarballs[0]), join(pack, 'unpacked')));
    }
    const port = await unusedPort();
    const registry = `http://127.0.0.1:${port}`;
    const config = join(workspace, 'registry.yaml');
    writeFileSync(
      config,
      `storage: ${JSON.stringify(join(workspace, 'storage'))}
auth:
  htpasswd:
    file: ${JSON.stringify(join(workspace, 'htpasswd'))}
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@open-twin/*':
    access: $all
    publish: $all
    unpublish: $all
  '**':
    access: $all
    proxy: npmjs
log: {type: stdout, format: json, level: warn}
`
    );
    registryProcess = spawn(
      join(ROOT, 'node_modules/.bin/verdaccio'),
      ['--config', config, '--listen', `127.0.0.1:${port}`],
      {
        stdio: ['ignore', log, log],
        env: { ...process.env, VERDACCIO_TELEMETRY: 'off' }
      }
    );
    let startupError: Error | undefined;
    registryProcess.on('error', (error) => {
      startupError = error;
    });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startupError) throw startupError;
      assert(registryProcess.exitCode === null, readFileSync(logPath, 'utf8'));
      try {
        ready = (await fetch(`${registry}/-/ping`, { signal: AbortSignal.timeout(500) })).ok;
      } catch (error) {
        if (!(error instanceof TypeError) && !(error instanceof DOMException)) throw error;
      }
      if (ready) break;
      await setTimeout(100);
    }
    assert(ready, `Local registry did not become responsive:\n${readFileSync(logPath, 'utf8')}`);
    for (const artifact of artifacts) await stage(registry, artifact);
    const userconfig = join(workspace, 'npmrc');
    writeFileSync(userconfig, `registry=${registry}\naudit=false\nfund=false\n`);
    const env = {
      ...process.env,
      NODE_PATH: '',
      npm_config_userconfig: userconfig,
      npm_config_registry: registry,
      npm_config_cache: join(workspace, 'npm-cache')
    };
    for (const artifact of artifacts) {
      const { name, version } = artifact.manifest;
      const consumer = join(workspace, `consumer-${name.split('/')[1]}`);
      mkdirSync(consumer);
      writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
      command('npm', ['install', `${name}@${version}`, '--no-audit', '--no-fund'], consumer, env);
      const imports = artifact.imports
        .map((specifier, index) => `import * as p${index} from ${JSON.stringify(specifier)};\nvoid p${index};`)
        .join('\n');
      writeFileSync(join(consumer, 'index.mjs'), imports);
      writeFileSync(join(consumer, 'index.mts'), imports);
      command(process.execPath, ['index.mjs'], consumer, env);
      command(
        process.execPath,
        [
          join(ROOT, 'node_modules/typescript/bin/tsc'),
          '--noEmit',
          '--strict',
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          '--target',
          'ES2022',
          'index.mts'
        ],
        consumer,
        env
      );
      const installed = readdirSync(join(consumer, 'node_modules/@open-twin')).sort();
      const expected = [name.split('/')[1]];
      if (name !== '@open-twin/fhir-core') expected.push('fhir-core');
      assert.deepEqual(installed, expected.sort(), `${name}: unexpected Open Twin dependencies`);
      if (name === '@open-twin/provider-oura') {
        command(
          'npm',
          [
            'install',
            `@open-twin/fhir-core@${artifacts.find((a) => a.manifest.name === '@open-twin/fhir-core')?.manifest.version}`,
            '--no-audit',
            '--no-fund'
          ],
          consumer,
          env
        );
        command(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            "import { numericComponent } from '@open-twin/fhir-core'; import * as provider from '@open-twin/provider-oura'; if (typeof numericComponent !== 'function' || !provider.getOuraData) throw Error('Shared imports failed');"
          ],
          consumer,
          env
        );
      }
      console.log(
        `PASS ${name}@${version}: install, ${artifact.imports.length} imports, declarations, dependency isolation`
      );
    }
    if (output) {
      const destination = resolve(output);
      mkdirSync(destination, { recursive: true });
      for (const artifact of artifacts) {
        writeFileSync(join(destination, basename(artifact.tarball)), readFileSync(artifact.tarball));
      }
    }
    console.log(`PASS: ${artifacts.length} independently consumable public packages`);
  } finally {
    if (registryProcess?.pid && registryProcess.exitCode === null) {
      const exited = once(registryProcess, 'exit');
      registryProcess.kill('SIGTERM');
      await exited;
    }
    closeSync(log);
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
