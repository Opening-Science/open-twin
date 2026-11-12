# Individually published packages

The 11 public packages use their existing `@open-twin/*` names and have independent
versions and release cadences. There is no fixed or linked release group.
The repository root and the four research packages (`anchor-layer`,
`provider-anchor`, `interpreter`, and `interpretation-contract`) remain private.

Automation does not imply registry availability. Maintainers must complete npm
setup and authorize each first release. Until then, source consumers can continue
using reviewed commits.

## Installation and shared components

After publication:

```bash
npm install @open-twin/provider-oura
```

Providers import `@open-twin/fhir-core` as a regular dependency. The package manager
installs a compatible core version automatically, without installing every
connector. Aggregate depends on core, not on all providers. Compatible core
versions can be deduplicated; incompatible ranges may need separate installed
versions, as with any npm dependency.

If the host itself imports core, it should declare that dependency too:

```bash
npm install @open-twin/provider-oura @open-twin/fhir-core
```

```ts
import { SYSTEMS } from '@open-twin/fhir-core';
import { getOuraData } from '@open-twin/provider-oura';
```

Public packages support ESM, Node >=20, and TypeScript declarations. Existing
schema subpaths remain available for Oura, VITRONIC, and OpenWearables. CommonJS
support is not added. The published OpenWearables name is
`@open-twin/open-wearables`, not its repository directory name.

Research and non-medical consumer wellness only. Packaging tests do not establish
clinical validity; see [intended use](INTENDED-USE.md).

## Compatibility and versions

- Run `pnpm changeset` for a public package change and select only affected
  packages. A documentation-only change with no release impact needs no changeset.
- Before 1.0, compatible fixes use patch releases; breaking behavior uses a minor
  release. After 1.0, follow Semantic Versioning's major/minor/patch rules.
- In the workspace, shared public dependencies use `workspace:^`. `pnpm pack`
  converts these to registry-compatible caret ranges, such as `^0.1.0`.
  Do not publish unresolved workspace protocols or replace core with a bundled copy.
- A core patch inside a provider's compatibility range does not force the provider
  or any unrelated connector to release.
- A dependency release outside a consumer's compatibility range requires a new
  consumer release. `pnpm release:version` promotes affected pre-1.0 consumers
  to minor releases (stable consumers to major releases). This is a conservative
  compatibility policy; review the associated API changes before merging.
- Review `pnpm release:status` before applying versions. Use
  `pnpm release:version`, not `pnpm exec changeset version`, so dependency
  propagation follows this policy and the lockfile is refreshed.
- Private research packages keep their versions. Changesets may refresh their
  internal dependency references when necessary for workspace builds; that does
  not authorize their publication.
- Per-package changelogs are generated with version changes. The root changelog
  and existing `v*` tags retain historical/project-level meaning.

## Artifact verification

```bash
pnpm build
pnpm release:check
pnpm check:packages
```

`release:check` uses disposable git/workspace fixtures and a loopback metadata
server. It verifies independent provider releases, compatible core patches,
breaking-core propagation, private exclusions, manual selection, invalid tags,
collisions, and missing registry dependencies. Signed-tag retry tests use a
temporary synthetic GPG key and local bare git remote, never the production key
or GitHub tag writes. Run these fixtures with Node 22 and GPG installed.
They do not change repository versions.

`check:packages` packs all public packages, verifies metadata, exports, declaration
targets, README and MIT license text, then stages those tarballs in a temporary
loopback-only Verdaccio registry. The registry does not proxy `@open-twin/*`, so an
old public package cannot conceal a missing local dependency. Each clean external
consumer installs just one package using npm, imports root and schema entry
points, type-checks with strict NodeNext resolution without `skipLibCheck`, and
checks the installed Open Twin dependency graph. A separate shared-import check
imports core alongside Oura.

pnpm includes the workspace root license in package tarballs; the check compares
its content to the root `LICENSE`. Keep required declaration dependencies
installable for consumers, including FHIR types and exposed Node types.

The check requires registry access for third-party dependencies, but never calls
vendor health APIs. It cleans up its own registry process and temporary files.
CI and `pnpm ci:local` run these checks after building and publication-boundary
verification. Existing terminology, unit, conformance, and review safeguards remain.

## Maintainer setup

1. Confirm ownership/access to the npm `@open-twin` scope and check each public
   package name and candidate version. Versions are immutable; the workflow
   refuses an existing version rather than treating it as success.
2. Enable Actions permission to create pull requests for the version-PR job.
   The workflow uses the GitHub API commit mode for signed bot commits and creates
   draft PRs. Review and squash them using the normal contribution rules.
3. Actions created with `GITHUB_TOKEN` do not trigger ordinary PR workflows.
   Explicitly run the **Verify** workflow using `workflow_dispatch` on the version
   PR branch before approving and merging it. Do not equate missing checks with
   passing checks.
4. Create the `npm-publish` environment with required maintainer reviewers.
   Allow deployments from `main` for button-driven releases and from the
   `@open-twin/*@*` tag pattern if retaining the signed-tag trigger. An environment
   name in YAML does not enforce approval; configure reviewers before enabling
   publication. The editor may flag the environment name until it exists.
5. Create a dedicated release-bot GPG signing key. Register its public key on the
   bot's GitHub account and ensure the key's email is verified on that account,
   so GitHub reports its annotated tags as verified. Add the secrets below to
   `npm-publish`, not to repository files or chat:

   | Environment secret        | Value                                                |
   | ------------------------- | ---------------------------------------------------- |
   | `RELEASE_GPG_PRIVATE_KEY` | The bot's exported ASCII-armored private signing key |
   | `RELEASE_GPG_PASSPHRASE`  | Its passphrase, if the key is passphrase-protected   |

   Allow the release workflow's `GITHUB_TOKEN` to create package tags
   (`contents: write`), subject to repository tag rules. No personal access token
   is required for tagging. Use a dedicated release key rather than a maintainer's
   everyday signing key.
6. Configure npm trusted publishing for each public package, binding
   `Opening-Science/open-twin`, workflow `release.yml`, and environment
   `npm-publish`. Follow [npm's current instructions][trusted-publishing],
   including any binding expiry requirements.
7. If npm requires an existing package to configure a trusted publisher, an
   authorized maintainer must bootstrap it first using an approved authentication
   method and the same verified tarball. No token fallback is configured here.
   Publish core before its consumers; bind trusted publishing immediately after
   bootstrap. Recheck current npm support instead of assuming first-publish OIDC.

The publish job uses npm 11.12.1, OIDC (`id-token: write`), public access, and
provenance. After environment approval, it checks out the exact prepared commit
for the native Node tagging helper, but does not install repository dependencies,
build again, or execute package lifecycle scripts. It downloads only the selected
artifact and checks its SHA-256 digest before importing the signing key.
The GPG action removes imported key material during its post-job cleanup.
No npm tokens are stored by this workflow.

These are one-time tasks for the maintainer handling release infrastructure.
Adding the workflow does not create/configure the environment, generate a
production signing key, register npm publishers, or publish a package.

## Releasing one package

1. Merge changes with package-specific changesets into `main`. The release
   workflow opens or updates the draft version/changelog PR.
2. Review the version plan, run Verify on the PR branch, obtain the normal review,
   and merge. All public packages may have an initial publication changeset, but
   each package is still published separately.
3. Open **Actions > Independent package releases > Run workflow**. Select
   branch `main` and choose one public package from the dropdown. The version
   comes from its manifest; the workflow does not increment it during publication.
   Manual dispatch from any other branch is rejected. Pending changesets affecting
   that package must be consumed by its version PR first; unrelated pending
   changesets do not block it.
4. The preparation job checks registry availability, required shared dependencies,
   and main ancestry. It runs build, lint, typecheck, tests, verification, release
   fixtures, and packed-consumer checks. Its summary records the package tag and
   exact checked commit for the approver; that commit is pinned across all jobs.
5. Approve deployment to `npm-publish`. The protected job checks the tarball digest,
   imports the bot signing key, creates and pushes the signed annotated package
   tag, and verifies its signature with GitHub. It then publishes only that
   package's verified tarball with lifecycle scripts disabled and npm provenance.
   Nothing is rebuilt after verification.

The signing job never moves tags. If a previous attempt created the tag but did
not publish, rerun the original workflow: it reuses the existing tag only when
its commit and verified signature match. A new dispatch from a different main
commit with the same package version fails instead of moving the tag.

Tags pushed with `GITHUB_TOKEN` do not start a second push-triggered release.
Publication continues in the same approved workflow run.

Publish `fhir-core` first during bootstrap or when consumers require its new
incompatible version. Other public packages can publish in any order once their
declared core range resolves. Do not dispatch dependent releases until core is
available. Competing release runs are serialized and an in-progress publication
is not cancelled.

### Existing signed-tag trigger

The original signed-tag path remains available. At a reviewed main commit whose
manifest version is `0.1.1`, for example:

```bash
git tag -s '@open-twin/provider-oura@0.1.1' -m 'Release @open-twin/provider-oura 0.1.1'
git push origin 'refs/tags/@open-twin/provider-oura@0.1.1'
```

The preparation job verifies this existing tag before the same checks and approval.
That path does not import the release-bot key or create another tag.

## Failures and recovery

- Signature, ancestry, selection, version, or artifact failures must be corrected
  before publication. Do not move or delete a release tag to conceal a failure.
- A missing dependency version is a hard failure. Publish the dependency, then
  rerun the dependent's original failed workflow at the same checked commit.
- Missing signing secrets, invalid signatures, and conflicting existing tags are
  hard failures before npm publication. Have the infrastructure maintainer finish
  setup rather than substituting an unsigned tag or removing environment approval.
- Network, registry, permission, and OIDC failures are failures, not an empty
  release plan or a successful publication.
- If publication succeeds but the workflow subsequently fails, inspect npm
  before rerunning. The existing-version check deliberately refuses a duplicate;
  record the successful published version rather than overwriting it.
- If a release sequence stops after some packages succeed, select only the
  remaining packages. There is no requirement to republish the whole set.
- The repository does not validate production npm permissions or OIDC locally.
  Report those as external setup until an authorized first release proves them.

[trusted-publishing]: https://docs.npmjs.com/trusted-publishers/
