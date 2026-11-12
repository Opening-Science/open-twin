/**
 * WHAT: Creates or reuses one immutable signed release tag after maintainer approval.
 * NOT: Does not publish packages, change versions or move existing tags.
 * GOVERNED BY: docs/PUBLISHING.md
 * CORRECTNESS: NONE — release provenance checks only
 */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { command, publicPackages, ROOT } from './package-utils.ts';

export function verifyReleaseCommit(commit: string, root = ROOT): void {
  assert(/^[a-f0-9]{40}$/.test(commit), 'Expected an immutable commit SHA');
  assert.equal(
    command('git', ['rev-parse', 'HEAD'], root).trim(),
    commit,
    'Checkout must match the checked release commit'
  );
  command('git', ['merge-base', '--is-ancestor', commit, 'origin/main'], root);
}

export function verifyReleaseTag(tag: string, commit: string, root = ROOT): void {
  const ref = `refs/tags/${tag}`;
  assert.equal(command('git', ['cat-file', '-t', ref], root).trim(), 'tag', 'An annotated signed tag is required');
  assert.equal(
    command('git', ['rev-parse', `${ref}^{commit}`], root).trim(),
    commit,
    'Tag points to a different commit'
  );
  const object = command('git', ['rev-parse', ref], root).trim();
  const record: {
    tag: string;
    object: { sha: string; type: string };
    verification?: { verified: boolean; reason: string };
  } = JSON.parse(command('gh', ['api', `repos/Opening-Science/open-twin/git/tags/${object}`], root));
  assert(
    record.tag === tag &&
      record.object.type === 'commit' &&
      record.object.sha === commit &&
      record.verification?.verified,
    `Tag signature or target is not verified: ${record.verification?.reason}`
  );
}

export function ensureReleaseTag(
  tag: string,
  commit: string,
  fingerprint: string,
  root = ROOT,
  verify: (tag: string, commit: string, root: string) => void = verifyReleaseTag,
  env = process.env
): void {
  const selected = publicPackages(root).find(({ manifest }) => tag === `${manifest.name}@${manifest.version}`);
  assert(selected, 'Tag must match a public package and its current version');
  assert(/^[a-fA-F0-9]{40,64}$/.test(fingerprint), 'A release-bot signing fingerprint is required');
  verifyReleaseCommit(commit, root);
  const ref = `refs/tags/${tag}`;
  const git = (...args: string[]) => command('git', args, root, env).trim();
  const remote = git('ls-remote', '--tags', '--refs', 'origin', ref);
  if (remote) {
    git('fetch', '--no-tags', 'origin', `${ref}:${ref}`);
    assert.equal(git('rev-parse', ref), remote.split(/\s/)[0], 'Local and remote tag objects differ');
  } else {
    if (!git('tag', '--list', tag)) {
      git('tag', '-s', '--local-user', fingerprint, '-m', `Release ${tag}`, tag, commit);
    }
    assert.equal(git('cat-file', '-t', ref), 'tag', 'An annotated signed tag is required');
    assert.equal(git('rev-parse', `${ref}^{commit}`), commit, 'Tag points to a different commit');
    git('verify-tag', ref);
    git('push', 'origin', ref);
  }
  verify(tag, commit, root);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [tag, commit] = process.argv.slice(2);
  assert(tag && commit, 'Usage: release-tag.ts <package@version> <checked-commit>');
  ensureReleaseTag(tag, commit, process.env.RELEASE_SIGNING_FINGERPRINT ?? '');
  console.log(`Verified signed release tag: ${tag} at ${commit}`);
}
