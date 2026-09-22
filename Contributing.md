# Contributing

Read [DECISIONS.md](DECISIONS.md) before changing a mapper or adding a connector.
It defines shared decisions for subject linkage, identifiers, code systems, and
units. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Do not use public issues or pull requests for security reports. Follow
[SECURITY.md](SECURITY.md) exclusively.

## Before a pull request

Use Node 20 or later and the pinned pnpm version.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm verify
```

Create an issue before starting a feature. Report non-security defects through
the issue tracker using the bug-report form. Branch from `main` using
`<issue-number>-<slug>`, keep changes focused, and open a pull request to
`main`.

The pull request must explain what changed, why, and how it was verified. Every
pull request requires maintainer approval before merge.

## Clinical and data safeguards

- Never invent a standard terminology code. Verify it against a primary source;
  otherwise use the relevant local `SYSTEMS.*` code and add
  `TODO(clinical-review)`.
- Add code and unit allowlist records as unreviewed, then record the official
  name and reviewer before approval. Do not bulk-approve records.
- Match units to the source data. Represent missing data with
  `dataAbsentReason`, not zero.
- Do not put API response bodies, health payloads, identifiers, credentials, or
  tokens in logs, errors, fixtures, issues, or pull requests.
- A passing test is not clinical evidence. Tests for mapper corrections must
  assert independently determined expected values.

## Legal

Do not commit proprietary vendor material or imply vendor endorsement. By
contributing, you license your contribution under the repository's
[MIT License](LICENSE).
