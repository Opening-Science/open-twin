# Terminology review procedure

## Vocabularies

Binding roles: [`docs/strategy/06_ADDENDUM_SYSTEMID_AND_TERMINOLOGY.md`](../strategy/06_ADDENDUM_SYSTEMID_AND_TERMINOLOGY.md).

## Where records live

Per-code review records:

`docs/terminology/review-records/{VOCAB}-{code}.md`

Legacy offline allowlist (still enforced by `verify/check-terminology.mjs`):

[`verify/terminology-allowlist.json`](../../verify/terminology-allowlist.json)

Unit exceptions:

[`verify/units-allowlist.json`](../../verify/units-allowlist.json)

Do **not** invent a terminology code. Do **not** fill verification fields from
memory or model output — a human signs after an authoritative lookup
([runbook](../runbooks/verify-a-code.md)).

## Gates

```bash
pnpm exec tsx verify/check-terminology.ts      # review records (UNVERIFIED = fail)
pnpm exec tsx verify/check-snomed-boundary.ts # no SCTIDs in published paths
node verify/check-terminology.mjs              # legacy allowlist
node verify/check-units.mjs
```
