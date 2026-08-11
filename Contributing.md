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

# Reporting Issues
 
## Feature Requests, Improvements, and Wishes
 
Any new feature idea, enhancement, improvement, or wish must be documented by creating an issue before implementation begins.
 
The purpose of creating an issue is to:
 
- Provide visibility to the community
- Allow maintainers to prioritize work
- Prevent duplicate efforts
- Ensure implementation requirements are clearly understood
 
### Required Issue Information
 
Issues should contain sufficient information for a developer to understand and implement the requested change.
 
At a minimum, an issue should include:
 
#### Title
 
A concise and descriptive summary.
 
#### Background
 
Describe the current situation and context.
 
#### Problem Statement
 
Clearly explain what problem is being solved.
 
#### Proposed Solution
 
Describe the expected behavior or implementation approach.
 
#### Acceptance Criteria
 
Provide measurable criteria that define when the work is considered complete.
 
Examples:
 
- A new API endpoint returns the requested data.
- Documentation has been updated.
- All tests pass successfully.
 
#### Additional Context
 
Include any relevant information such as:
 
- Screenshots
- References
- Links to specifications
- Related issues
 
---
 
## Non-Security Bug Reports
 
Non-security related bugs should be reported through the repository issue tracker.
 
Bug reports should include:
 
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment information
- Relevant logs or error messages
 
Maintainers may request additional information before work begins.

# Security Vulnerability Reporting
 
Security vulnerabilities must **not** be reported through the public issue tracker.
 
Instead, security-related findings should be reported directly to the repository maintainers through a private communication channel or use GitHub's private
vulnerability reporting on this repository.
 
Examples include:
 
- Authentication bypasses
- Authorization issues
- Privilege escalation vulnerabilities
- Remote code execution vulnerabilities
- Sensitive data exposure
- Dependency vulnerabilities with security impact
 
Maintainers will coordinate vulnerability assessment, remediation, disclosure, and release management.
 
---

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
- Commit signing will be enforced via branch protection rules as soon as the repository will go public.
- A PR should say what changed, why, and how it was verified — including which
  gate or fixture would have caught the defect it fixes.

## Implementation Requirements
 
All implementations should:
 
- Fulfill the issue requirements
- Follow established architectural patterns
- Minimize unnecessary complexity
- Maintain backward compatibility whenever possible
- Include appropriate test coverage
 
Developers should avoid introducing unrelated changes within the same contribution.

# Review and Approval
 
Every pull request must be reviewed and approved by at least one repository maintainer before it can be merged.
 
The reviewer is responsible for evaluating:
 
- Correctness
- Code quality
- Test coverage
- Compliance with repository standards
- Potential security implications
- Architectural consistency
 
Maintainers may request revisions before approval is granted.
 
No pull request may be merged without the required approval.

# Contributor Responsibilities
 
Contributors are expected to:
 
- Act professionally and respectfully
- Follow repository processes
- Provide accurate information in issues and pull requests
- Address review feedback in a timely manner
- Maintain the quality and integrity of the project


## Adding a mapper or a connector

Read [DECISIONS.md](DECISIONS.md) first. Subject linkage (D1), ids (D2), code
systems (D3) and units (D4) are decided once and shared — a connector that
decides these for itself is wrong even when each choice is individually
defensible. The checklist form lives in [ONBOARDING.md](ONBOARDING.md).

# Compliance Statement
 
Compliance with this guide is mandatory for all repository contributions. Maintainers reserve the right to reject contributions that do not meet the requirements defined in this document.
 
The goal of these requirements is to ensure that the project remains secure, maintainable, transparent, and accessible for the broader open science community.

## Legal

This project is an independent, unofficial integration for the vendors it
connects to. Do not use vendor branding beyond naming compatibility, do not
misrepresent the project as official, and do not commit proprietary material
from any vendor. All contributions are licensed under the repository's
[MIT License](LICENSE).
