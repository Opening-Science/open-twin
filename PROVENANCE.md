# Provenance

## Current repository

Development and pull requests use `Opening-Science/open-twin`. The historical
account below describes a previous migration to `etzm/open-twin`; its remote and
PR instructions are superseded. Check current remotes and PR status before acting.

---

## Historical record — 26 July 2026

Superseded; retained for history only.

Where this code came from, where it lives now, and how to take it back.

### This repository is the source of truth

Active development is on **`etzm/open-twin`** (private).

`Opening-Science/open-twin` is the origin of this code and is now a **historical
reference**. It is not kept in sync, and it should not be treated as a place where
work is happening.

```
origin    -> github.com/etzm/open-twin              fetch + push
upstream  -> github.com/Opening-Science/open-twin   fetch only, push disabled
```

The `upstream` push URL is deliberately set to a non-URL so that an accidental
`git push upstream` fails loudly instead of quietly writing to the original
repository. Re-enabling it is meant to be a conscious decision:

```bash
git remote set-url --push upstream https://github.com/Opening-Science/open-twin.git
```

### Why a mirror and not a fork

`gh repo fork` returns `HTTP 403: The repository exists, but forking is disabled`.
The Opening-Science organisation sets `members_can_fork_private_repositories: false`.
Relaxing that would have weakened a security control across every member and every
private repository in the organisation, not just this one, so a separate private
repository was created instead.

The practical consequence: there is no GitHub fork relationship. No automatic
upstream tracking, and no cross-repository pull requests. Everything else works
normally.

### What happened on 26 July 2026

The original repository was assessed and 50 defects were reported. That assessment
was independently re-verified here: 52 confirmed, 9 corrected or refuted, and **57
further defects found that were not in it**. The corrections matter as much as the
confirmations — one of them, applied literally, would have made the output worse.
See `DECISIONS.md` for the ten cross-cutting decisions and the reasoning.

The work was then split into eight branches, and pull requests were opened **twice**:
first on `Opening-Science/open-twin` (#68–75), then again here after the move.

**The pull requests on Opening-Science are stale.** Everything after 02:33 UTC on
26 July 2026 exists only in this repository — including the merge-conflict resolution
on the three connector-fix branches. Do not review them, and do not merge them.

| Here | Stale equivalent on Opening-Science | Branch |
|---|---|---|
| #1 | #68 | `open-twin/foundation` |
| #2 | #69 | `open-twin/fix-oura` |
| #3 | #70 | `open-twin/fix-google-health` |
| #4 | #71 | `open-twin/fix-vitronic` |
| #5 | #72 | `open-twin/add-hl7v2` |
| #6 | #73 | `open-twin/add-genomics-vcf` |
| #7 | #74 | `open-twin/add-open-wearables` |
| #8 | #75 | `open-twin/add-fhir-r4` |

### For the Opening-Science team: how to copy this back

Nothing here is withheld, and nothing needs to be reconstructed. The whole history
is intact and can be pulled directly once you have read access:

```bash
git remote add opentwin https://github.com/etzm/open-twin.git
git fetch opentwin
git checkout -b open-twin/foundation opentwin/open-twin/foundation
```

Take `open-twin/foundation` first — every other branch builds on it. The eight
branches are independent of each other after that and can be taken in any order.

Two things worth knowing before you do:

- **The verification gates fail on purpose.** `verify/check-terminology.mjs` reports
  unreviewed LOINC and SNOMED codes and will keep failing until a named clinical
  reviewer signs each one off. That is the design. Do not clear it by bulk-approving
  the allowlist — the entire value of the gate is that approval costs a lookup, which
  is precisely the step that was skipped when five wrong codes shipped.
- **The HL7 validator is the real check**, and it passes with zero errors across every
  emitted bundle. It is also what found two defects that code review did not. If you
  keep one thing from this work, keep that CI job.
