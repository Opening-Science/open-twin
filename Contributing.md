# Contributing

This document is the working agreement for changes to `open-twin`. It is short
because the load-bearing rules live where they are enforced: the verification
gates under `verify/`, the decisions in [DECISIONS.md](DECISIONS.md), and the
standing brief in [CLAUDE.md](CLAUDE.md). Nothing here is aspirational — every
command runs, every claim is enforced or explicitly marked as convention.

## Setup

Node ≥ 20 and pnpm 11 (pinned via `packageManager` — `corepack enable`, or
`npm i -g pnpm@11.17.0`).

```bash
pnpm install --frozen-lockfile
```

## Before every PR

```bash
pnpm lint          # biome — format and lint
pnpm typecheck     # tsc --noEmit, every package
pnpm test          # every package
pnpm verify        # terminology + UCUM gates — fail closed
```

CI runs the same, plus the HL7 validator (structure, blocking) and a terminology
tier against `tx.fhir.org` (non-blocking, because that server carries no SLA).
A PR is mergeable when the blocking checks are green — but read the next section
before trusting green.

## The one thing to understand before changing anything

**A green test run is not evidence that a change is correct.** The tests assert
what the code produces, not what FHIR requires — this repository once had 270
passing tests over output with radians labelled as degrees and five wrong
clinical codes, several of them asserted as intended behaviour.

Consequences:

- When you fix a mapper, expect to change its test **in the same commit**, and
  say in the message that the previous assertion was wrong.
- Do not leave a test asserting old behaviour with a skip on it.
- A defect class no gate catches needs a fixture with an **independently
  computed** expected value, not a snapshot of what the code currently emits.

## Terminology and units

- **Never invent a terminology code.** If you cannot verify a code against a
  primary source, use the connector's own code system under `SYSTEMS.*` and
  leave a `TODO(clinical-review)` naming what needs sign-off.
- New codes and unit pairs land on the allowlists under `verify/` as
  unreviewed, and the gate fails until each is looked up **once**, recorded
  with the official name and the reviewer, and flipped to `approved`. Do not
  bulk-approve — the entire value of the gate is that approval costs a lookup.
- Units must match the data, not just the code. Check what the API actually
  sends. Missing data is `dataAbsentReason`, never `0`.

## Error hygiene

Never put an API response body into an error message or a log line — these are
health payloads. Use `ConnectorError` from `@open-twin/fhir-core`, which carries
a status, an operation and a code, and no payload. The same discipline applies
to validation reports: findings locate elements by FHIRPath expression and never
quote input values.

## Branches, commits, PRs

- Branch per issue, named `<issue-number>-<slug>`; merged by PR into `main`.
- Conventional-commit subjects (`fix(provider-oura): …`) are the norm in the
  history; keep to them.
- Commit signing is not required and not enforced. If that ever changes, it
  will be enforced through branch protection, not requested in prose.
- A PR should say what changed, why, and how it was verified — including which
  gate or fixture would have caught the defect it fixes.

## Adding a mapper or a connector

Read [DECISIONS.md](DECISIONS.md) first. Subject linkage (D1), ids (D2), code
systems (D3) and units (D4) are decided once and shared — a connector that
decides these for itself is wrong even when each choice is individually
defensible. The checklist form lives in [ONBOARDING.md](ONBOARDING.md).

## Security

Do not open a public issue for a vulnerability. Use GitHub's private
vulnerability reporting on this repository, or contact the maintainer directly.

## Legal

This project is an independent, unofficial integration for the vendors it
connects to. Do not use vendor branding beyond naming compatibility, do not
misrepresent the project as official, and do not commit proprietary material
from any vendor. All contributions are licensed under the repository's
[MIT License](LICENSE).
