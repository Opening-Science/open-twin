import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { command, PUBLIC_NAMES, packages, publicPackages, ROOT, readManifest } from './package-utils';
import { registryPreflight, releasePlan, selectManualPackage, selectPackage, versionWorkspace } from './release';
import { ensureReleaseTag, verifyReleaseCommit } from './release-tag';

function fixture(changes: Record<string, 'patch' | 'minor' | 'major'> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'open-twin-release-test-'));
  mkdirSync(join(root, '.changeset'));
  cpSync(join(ROOT, '.changeset/config.json'), join(root, '.changeset/config.json'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, workspaces: ['packages/*'] }));
  cpSync(join(ROOT, 'pnpm-workspace.yaml'), join(root, 'pnpm-workspace.yaml'));
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
  for (const { directory, manifest } of packages()) {
    const destination = join(root, 'packages', directory.split('/').pop() ?? '');
    mkdirSync(destination, { recursive: true });
    writeFileSync(
      join(destination, 'package.json'),
      JSON.stringify({
        ...manifest,
        version: manifest.private ? manifest.version : '0.1.0'
      })
    );
  }
  if (Object.keys(changes).length) {
    writeFileSync(
      join(root, '.changeset', 'test-change.md'),
      `---\n${Object.entries(changes)
        .map(([name, type]) => `${JSON.stringify(name)}: ${type}`)
        .join('\n')}\n---\n\nSynthetic release fixture.\n`
    );
  }
  command('git', ['init', '-b', 'main'], root);
  command('git', ['add', '.'], root);
  command(
    'git',
    [
      '-c',
      'commit.gpgsign=false',
      '-c',
      'user.name=Release fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'Synthetic release fixture\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
    ],
    root
  );
  command('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], root);
  return root;
}

const scenarios: {
  title: string;
  changes: Record<string, 'patch' | 'minor'>;
  names: string[];
  core: string;
  provider: string;
}[] = [
  { title: 'no pending changes does not release anything', changes: {}, names: [], core: '0.1.0', provider: '0.1.0' },
  {
    title: 'provider-only patch leaves unrelated versions alone',
    changes: { '@open-twin/provider-oura': 'patch' },
    names: ['@open-twin/provider-oura'],
    core: '0.1.0',
    provider: '0.1.1'
  },
  {
    title: 'compatible core patch does not release providers',
    changes: { '@open-twin/fhir-core': 'patch' },
    names: ['@open-twin/fhir-core'],
    core: '0.1.1',
    provider: '0.1.0'
  },
  {
    title: 'breaking pre-1.0 core release bumps affected providers to minor',
    changes: { '@open-twin/fhir-core': 'minor' },
    names: publicPackages().map(({ manifest }) => manifest.name),
    core: '0.2.0',
    provider: '0.2.0'
  }
];
for (const scenario of scenarios) {
  test(scenario.title, async () => {
    const root = fixture(scenario.changes);
    try {
      const privateBefore = packages(root)
        .filter(({ manifest }) => manifest.private)
        .map(({ manifest }) => [manifest.name, manifest.version]);
      assert.deepEqual(
        (await releasePlan(root)).plan.releases.map((release) => release.name).sort(),
        [...scenario.names].sort()
      );
      const plan = await versionWorkspace(root);
      for (const { manifest } of publicPackages(root)) {
        assert.equal(
          manifest.version,
          plan.releases.find((release) => release.name === manifest.name)?.newVersion ?? '0.1.0',
          `Unexpected version for ${manifest.name}`
        );
      }
      assert.equal(readManifest(join(root, 'packages/fhir-core')).version, scenario.core);
      assert.equal(readManifest(join(root, 'packages/provider-oura')).version, scenario.provider);
      assert.deepEqual(
        packages(root)
          .filter(({ manifest }) => manifest.private)
          .map(({ manifest }) => [manifest.name, manifest.version]),
        privateBefore
      );
      assert(plan.releases.every((release) => !release.name.includes('anchor')));
      if (scenario.core === '0.2.0') {
        assert.equal(
          readManifest(join(root, 'packages/provider-oura')).dependencies?.['@open-twin/fhir-core'],
          'workspace:^'
        );
        assert(readFileSync(join(root, 'packages/provider-oura/CHANGELOG.md'), 'utf8').includes('0.2.0'));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('release selection rejects private, unknown, mismatched and malformed tags', () => {
  const root = fixture();
  try {
    for (const tag of [
      '@open-twin/interpreter@0.1.0',
      '@open-twin/unknown@0.1.0',
      '@open-twin/provider-oura@9.0.0',
      'v0.1.0',
      '@open-twin/provider-oura@0.1.0-beta.1'
    ])
      assert.throws(() => selectPackage(tag, root));
    assert.equal(selectPackage('@open-twin/provider-oura@0.1.0', root).manifest.name, '@open-twin/provider-oura');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('manual selection is main-only, public-only, and waits for the selected version PR', async () => {
  const root = fixture({ '@open-twin/provider-oura': 'patch' });
  try {
    await assert.rejects(selectManualPackage('@open-twin/fhir-core', 'refs/heads/feature', root), /must run from main/);
    await assert.rejects(selectManualPackage('@open-twin/interpreter', 'refs/heads/main', root), /private/);
    await assert.rejects(selectManualPackage('@open-twin/unknown', 'refs/heads/main', root), /Unknown/);
    await assert.rejects(
      selectManualPackage('@open-twin/provider-oura', 'refs/heads/main', root),
      /pending version PR/
    );
    assert.equal(
      (await selectManualPackage('@open-twin/provider-whoop', 'refs/heads/main', root)).manifest.version,
      '0.1.0',
      'An unrelated pending release must not block this package'
    );
    await versionWorkspace(root);
    assert.equal(
      (await selectManualPackage('@open-twin/provider-oura', 'refs/heads/main', root)).manifest.version,
      '0.1.1'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('release commits must be the exact checked main ancestor', () => {
  const root = fixture();
  try {
    const commit = command('git', ['rev-parse', 'HEAD'], root).trim();
    verifyReleaseCommit(commit, root);
    assert.throws(() => verifyReleaseCommit('main', root), /immutable commit SHA/);
    assert.throws(() => verifyReleaseCommit('0'.repeat(40), root), /Checkout must match/);
    command('git', ['update-ref', '-d', 'refs/remotes/origin/main'], root);
    assert.throws(() => verifyReleaseCommit(commit, root), /merge-base/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the protected tag entrypoint runs with native Node without repository dependencies', () => {
  const root = fixture();
  try {
    rmSync(join(root, 'node_modules'));
    mkdirSync(join(root, 'scripts'));
    for (const file of ['release-tag.ts', 'package-utils.ts'])
      cpSync(join(ROOT, 'scripts', file), join(root, 'scripts', file));
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', join(root, 'scripts/release-tag.ts'), '@open-twin/private@0.1.0', '0'.repeat(40)],
      { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } }
    );
    assert.equal(result.status, 1);
    assert(result.stderr.includes('Tag must match a public package'), result.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the manual workflow dropdown includes all and only public packages', () => {
  const workflow = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8');
  const choices = [...workflow.matchAll(/^ {10}- "(@open-twin\/[a-z0-9-]+)"$/gm)].map((match) => match[1]);
  assert.deepEqual(choices.sort(), [...PUBLIC_NAMES].sort());
});

test('signed tagging creates one immutable remote tag, safely retries, and rejects conflicting or unsigned tags', () => {
  const root = fixture();
  const home = mkdtempSync(join(tmpdir(), 'open-twin-signing-test-'));
  const remote = mkdtempSync(join(tmpdir(), 'open-twin-tag-remote-'));
  const env = { ...process.env, GNUPGHOME: home };
  let agentPid: number | undefined;
  try {
    command(
      'gpg',
      [
        '--batch',
        '--pinentry-mode',
        'loopback',
        '--passphrase',
        '',
        '--quick-generate-key',
        'Release fixture <fixture@example.invalid>',
        'ed25519',
        'sign',
        '0'
      ],
      root,
      env
    );
    const agent = command('gpg-connect-agent', ['GETINFO pid', '/bye'], root, env).match(/^D (\d+)$/m);
    assert(agent, 'Could not identify the isolated test signing agent');
    agentPid = Number(agent[1]);
    const fingerprint = command('gpg', ['--batch', '--with-colons', '--list-secret-keys'], root, env)
      .split('\n')
      .find((line) => line.startsWith('fpr:'))
      ?.split(':')[9];
    assert(fingerprint);
    command('git', ['init', '--bare', remote], root);
    command('git', ['remote', 'add', 'origin', remote], root);
    command('git', ['config', 'user.name', 'Release fixture'], root);
    command('git', ['config', 'user.email', 'fixture@example.invalid'], root);
    const commit = command('git', ['rev-parse', 'HEAD'], root).trim();
    const verify = (tag: string, expected: string, directory: string) => {
      assert.equal(command('git', ['rev-parse', `refs/tags/${tag}^{commit}`], directory).trim(), expected);
      command('git', ['verify-tag', `refs/tags/${tag}`], directory, env);
    };
    const tag = '@open-twin/fhir-core@0.1.0';
    ensureReleaseTag(tag, commit, fingerprint, root, verify, env);
    const original = command('git', ['rev-parse', `refs/tags/${tag}`], root).trim();
    ensureReleaseTag(tag, commit, fingerprint, root, verify, env);
    assert.equal(command('git', ['rev-parse', `refs/tags/${tag}`], root).trim(), original);
    assert(command('git', ['ls-remote', '--tags', '--refs', 'origin', `refs/tags/${tag}`], root).startsWith(original));
    assert.throws(
      () => ensureReleaseTag('@open-twin/interpreter@0.1.0', commit, fingerprint, root, verify, env),
      /public package/
    );
    assert.throws(() => ensureReleaseTag(tag, commit, '', root, verify, env), /signing fingerprint/);

    const unsigned = '@open-twin/reader-core@0.1.0';
    command('git', ['-c', 'tag.gpgsign=false', 'tag', '-a', unsigned, '-m', 'Unsigned test tag'], root);
    command('git', ['push', 'origin', `refs/tags/${unsigned}`], root);
    assert.throws(() => ensureReleaseTag(unsigned, commit, fingerprint, root, verify, env), /verify-tag/);

    command(
      'git',
      [
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--allow-empty',
        '-m',
        'Another synthetic commit\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
      ],
      root
    );
    command('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], root);
    const different = command('git', ['rev-parse', 'HEAD'], root).trim();
    assert.throws(() => ensureReleaseTag(tag, different, fingerprint, root, verify, env));
    assert.equal(command('git', ['rev-parse', `refs/tags/${tag}`], root).trim(), original);
  } finally {
    if (agentPid) process.kill(agentPid, 'SIGTERM');
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  }
});

test('registry preflight distinguishes collisions, dependency readiness, absence and registry errors', async () => {
  let state: 'ready' | 'collision' | 'missing' | 'incompatible' | 'error' = 'ready';
  const server = createServer((request, response) => {
    const name = decodeURIComponent(request.url?.slice(1) ?? '');
    response.setHeader('content-type', 'application/json');
    if (state === 'error') {
      response.writeHead(503).end('{}');
      return;
    }
    if (name === '@open-twin/provider-oura') {
      if (state === 'collision') response.end(JSON.stringify({ versions: { '0.1.0': {} } }));
      else response.writeHead(404).end('{}');
    } else if (state === 'missing') response.writeHead(404).end('{}');
    else response.end(JSON.stringify({ versions: { [state === 'incompatible' ? '0.2.0' : '0.1.0']: {} } }));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    const registry = `http://127.0.0.1:${address.port}`;
    const inventory = publicPackages().map(({ manifest }) => ({ ...manifest, version: '0.1.0' }));
    const provider = inventory.find((manifest) => manifest.name === '@open-twin/provider-oura');
    assert(provider);
    await registryPreflight(provider, inventory, registry);
    state = 'collision';
    await assert.rejects(registryPreflight(provider, inventory, registry), /already published/);
    state = 'missing';
    await assert.rejects(registryPreflight(provider, inventory, registry), /Publish a compatible/);
    state = 'incompatible';
    await assert.rejects(registryPreflight(provider, inventory, registry), /No published/);
    state = 'error';
    await assert.rejects(registryPreflight(provider, inventory, registry), /HTTP 503/);
  } finally {
    await new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())));
  }
});
