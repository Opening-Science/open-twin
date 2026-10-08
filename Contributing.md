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
