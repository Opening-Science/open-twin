# Terminology review procedure

## Vocabularies

Binding roles: [`docs/strategy/06_ADDENDUM_SYSTEMID_AND_TERMINOLOGY.md`](../strategy/06_ADDENDUM_SYSTEMID_AND_TERMINOLOGY.md).

## Where records live

Per-code review records:

`docs/terminology/review-records/{VOCAB}-{code}.md`

Offline allowlist (enforced by `verify/check-terminology.mjs` as G1, and read by
G2):

[`verify/terminology-allowlist.json`](../../verify/terminology-allowlist.json)

A G1 **APPROVED** entry satisfies G2's review-record requirement for that code
(matched by vocabulary/`system`). Do not create a duplicate markdown record for
a code already APPROVED on the allowlist — sign new records only for codes G2
still reports as MISSING or UNVERIFIED.

Unit exceptions:

[`verify/units-allowlist.json`](../../verify/units-allowlist.json)

Do **not** invent a terminology code. Do **not** fill verification fields from
memory or model output — a human signs after an authoritative lookup
([runbook](../runbooks/verify-a-code.md)).

## Gates

Canonical entry point — runs every registered gate via `verify/run-verify.ts`:

```bash
pnpm verify
```

Terminology-related scripts (subset; full set is whatever `run-verify` registers):

```bash
pnpm exec tsx verify/check-terminology.ts      # review records (UNVERIFIED = fail)
pnpm exec tsx verify/check-snomed-boundary.ts # no SCTIDs in published paths
node verify/check-terminology.mjs              # G1 allowlist
node verify/check-units.mjs
```
