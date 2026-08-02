# Finding: connector LOINC codes lack review records

`scripts/check-terminology.ts` currently finds on the order of **50+** distinct
LOINC (and related) codes in connector / sample / genomics source that are
**not** among the 67 Anchor-layer stubs.

Those fail as `MISSING REVIEW RECORD`. The 67 Anchor stubs fail as
`UNVERIFIED`. Both are intentional red until humans sign or add stubs.

This finding tracks the non-Anchor backlog. Do not bulk-approve.

## Reconciliation (branch 21)

G2 now reads `verify/terminology-allowlist.json`. An **APPROVED** allowlist entry
satisfies the review-record requirement for that code, so the historical "51
MISSING" figure was mostly double-counting against G1.

After reconciliation (same source scan):

| Bucket | Count |
|---|---:|
| COVERED BY G1 APPROVED (not MISSING) | 31 |
| True MISSING (not approved on allowlist) | 20 (15 LOINC + 5 UCUM) |
| UNVERIFIED Anchor stubs on disk (G2a) | 67 |
