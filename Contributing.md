# Contributing

Read [DECISIONS.md](DECISIONS.md) before changing a mapper or adding a connector.
It defines shared decisions for subject linkage, identifiers, code systems, and
units. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Do not use public issues or pull requests for security reports. Follow
[SECURITY.md](SECURITY.md) exclusively.

## Before a pull request

Use Node 22 (as in CI; `engines` declares >=20) and pnpm 11.17.0.

```bash
npm install -g pnpm@11.17.0
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm verify
```

Or run all of the above, plus the offline HL7 FHIR validator that CI runs, in one
command. It needs a JDK 21 for the validator; it fetches the validator jar version
pinned in `.github/workflows/verify.yml` and caches it under `~/.cache/open-twin`.

```bash
pnpm ci:local              # every blocking CI job, in CI order
pnpm ci:local --tx         # also the advisory tx.fhir.org terminology tier
pnpm ci:local --no-validator
```

A stage skipped with `--no-validator` is reported as such; that run does not match CI.

Create an issue before starting a feature. Report non-security defects through
the issue tracker using the bug-report form. Branch from `main` using
`<issue-number>-<slug>` and open a pull request to `main`.

Keep each pull request to one concern. Write or summarise its description
yourself in at most 10 lines: What, Behaviour, How tested, and `Closes #n`. Do
not paste raw AI output. Every pull request requires maintainer approval before
merge.

## Clinical and data safeguards

- Never invent a standard terminology code. Verify it against a primary source;
  otherwise use the relevant local `SYSTEMS.*` code and add
  `TODO(clinical-review)`.
- Add code and unit allowlist records as unreviewed, then record the official
  name and reviewer before approval. Do not bulk-approve records.
- Match units to the source data. Represent missing data with
  `dataAbsentReason`, not zero.
- Fixtures may contain synthetic data, including synthetic vendor responses,
  once its provenance and redistribution rights are recorded beside it, in the
  fixture folder's `PROVENANCE.md` or the file header; see
  [third-party rights](docs/INTENDED-USE.md#third-party-rights).
- Do not put real participant data, identifiers, credentials, or tokens in
  fixtures, logs, errors, issues, or pull requests. Keep API response bodies and
  health payloads out of logs, errors, issues, and pull requests.
- Tests for mapper corrections must assert independently determined expected
  values; see [validation limits](docs/INTENDED-USE.md#purpose-and-limits).

## How changes land

open-twin works trunk-based: `main` is always releasable, and every change
reaches it through a short-lived branch and one pull request.

- One issue, one branch, one pull request. Aim to merge within a few days;
  split larger work into small pull requests rather than keeping a long-lived
  branch. A branch that builds on another open pull request says so in its
  description and merges after it.
- Open a **draft** pull request early if you want feedback. Mark it ready for
  review when CI is green.
- Keep your branch current with `main` (GitHub's "Update branch" button, or a
  merge of `main`). Do not rebase or force-push a branch someone else has
  reviewed or built on. The checks in `.github/workflows/verify.yml` must pass
  on the up-to-date branch; the two advisory jobs (terminology review
  outstanding, tx.fhir.org terminology) are reported but do not block.
- Sign off every commit (`git commit -s`) and sign it. The sign-off certifies
  the [Developer Certificate of Origin](https://developercertificate.org/): you
  wrote the change or have the right to submit it under the MIT licence. This is
  a maintainer rule; no check enforces the sign-off yet.
- Pull requests are **squash-merged**, so the pull request title becomes the
  commit on `main`. Write it like a commit subject: `type(#issue): summary`,
  where `type` is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore` or
  `perf`.
- `main` is protected: changes arrive only by pull request with one approving
  review, commits must be signed, and force pushes and deletion are blocked. The
  ruleset requires no status checks, so merging only when every blocking check
  is green is a maintainer rule.

## Releases

open-twin follows [Semantic Versioning](https://semver.org/). Until 1.0, a minor
version (`0.x.0`) may change behaviour; a patch version (`0.x.y`) only fixes.

- The 11 public packages have independent versions and release cadences. They
  retain ordinary shared dependencies, including `@open-twin/fhir-core`.
  The four private research packages remain unpublished.
- Add a changeset with `pnpm changeset` for public package changes. Select only
  affected packages; inspect the plan with `pnpm release:status`.
- Changesets prepares a draft version/changelog PR. Use `pnpm release:version`
  rather than the bare Changesets version command: the wrapper ensures breaking
  shared dependency changes do not become pre-1.0 dependent patch releases.
  Version PRs still require the normal checks and approving review.
- Planned work is grouped in a
  [milestone](https://github.com/Opening-Science/open-twin/milestones) per
  release.
- After merging the version PR, select `main` and one package in the release
  workflow's **Run workflow** menu. It checks release readiness, registry
  dependencies, existing correctness gates, and clean external consumers before
  requesting approval through `npm-publish`. After approval, the bot creates a
  signed package-specific tag and publishes only that package's checked tarball.
  Existing manually signed package tags remain supported. Release tags never
  move and are never deleted.
- Publication needs a maintainer-configured protected environment, a dedicated
  bot signing key, npm scope access, and per-package trusted publishers.
  See [Publishing](docs/PUBLISHING.md) for setup, bootstrap, CI checks on
  automated PRs, and recovery. No packages become available just by merging this
  automation. Until first publication, source consumers may continue pinning
  reviewed commits.
- New package changelogs are managed by Changesets. The root
  [CHANGELOG.md](CHANGELOG.md) retains project-level and historical entries;
  existing `v*` tags remain historical shared releases.
- Fixes land on `main` first and receive an appropriate package changeset.
  The selective release workflow requires release commits on `main`; maintenance
  branches do not bypass that requirement.
- Release notes name any change a consumer must act on, such as a renamed
  export, a changed code system or a new required unit.

## AI-assisted contributions

The same rules apply to AI-assisted work, and the contributor remains
responsible for it. Never put personal or health data into AI tools. Agent
instructions are in [CLAUDE.md](CLAUDE.md).

## Legal

Contribute only material you have the right to license. By contributing, you
license your contribution under [MIT](LICENSE).
Record third-party sources, terms, redistribution permission and required
notices; follow [third-party rights](docs/INTENDED-USE.md#third-party-rights).
Changes to health claims, interpretation outputs or supported audiences must
update [intended use](docs/INTENDED-USE.md) and identify assessments needed before
release. See [warranty and responsibility](docs/INTENDED-USE.md#warranty-and-responsibility).
