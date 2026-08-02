# Verify baseline — gate picture (do not collapse)

Status: living baseline until terminology dual-gate resolution (follow-up of P8.0b).
Update when a gate’s intentional red changes, or when a real defect is fixed.

`pnpm verify` runs **every** gate via `verify/run-verify.ts` and fails only on the
aggregate exit code. Do not short-circuit: the baseline needs the full picture.

## Gate rows (keep distinct)

### G1 — Terminology allowlist (`verify/check-terminology.mjs`)

| Field | Value |
|---|---|
| Home | `verify/check-terminology.mjs` + `verify/terminology-allowlist.json` |
| What it answers | Are LOINC/SNOMED codes next to a `system` under `packages/*/src/fhir` on the allowlist with status `approved` (and display match when `verified_display` is set)? |
| Current | Typically **PASS** — “APPROVED (72)” after 2026-07-26 bulk sign-off by Martin Etzrodt (see allowlist `_readme`) |
| Intentional red? | No (unless a rejected code reappears) |

### G2 — Terminology review-records (`verify/check-terminology.ts`, advisory until Anchor 67 signed)

| Field | Value |
|---|---|
| Home | `verify/check-terminology.ts` + `docs/terminology/review-records/` + G1 allowlist |
| What it answers | Does every LOINC/UCUM/SNOMED/FMA/UBERON literal in `src/` have a markdown review record with signed verification fields (not the literal `UNVERIFIED`)? |
| Current | **FAIL** — see G2a and G2b separately |
| Intentional red? | Partially — see sub-rows |

### G2a — 67 UNVERIFIED Anchor stubs (deliberate work queue)

| Field | Value |
|---|---|
| Origin | P2 created stub records for all 67 Anchor-core LOINC codes with verification fields left `UNVERIFIED` |
| Owner | Clinical reviewer (human sign-off per `docs/runbooks/verify-a-code.md`) |
| Resolution | Sign each record; do not bulk-approve |
| Must not absorb | G2b |

### G2b — 51 MISSING non-Anchor review records (pre-existing debt)

| Field | Value |
|---|---|
| Origin | Codes already in connectors / samples / genomics that have **no** `docs/terminology/review-records/*.md` file. Discovered when P2’s gate scanned beyond Anchor. |
| Owner | Engineering + clinical review (pre-existing debt, not a P2-created queue) |
| Overlap with G1 | Many of these 51 are already **APPROVED** on the allowlist (G1). The MISSING count is largely “second gate does not read the allowlist,” not “code never reviewed.” Exact overlap is in the P8.0b analysis. |
| Must not absorb | G2a |

### G3 — Canary suite (`verify/check-canaries.ts`, when registered)

| Field | Value |
|---|---|
| Home | `verify/canaries/` + `verify/check-canaries.ts` (when registered) |
| Current | **FAIL** while any `FINDING:UNCAUGHT` or `ACCEPTED` remains |
| Intentional findings | 04, 05, 06, 11 (no existing semantic gate) — do not paper over |
| Caught (incl. wrong-kind band) | 01, 02, 03, 07, 08, 09, 10, 12 |

### Other gates

| Gate | Script | Typical |
|---|---|---|
| UCUM units | `verify/check-units.mjs` | PASS |
| Module headers | `verify/check-headers.ts` | PASS |
| Docs integrity | `verify/check-docs.ts` | PASS |
| SNOMED publication boundary | `verify/check-snomed-boundary.ts` (when registered) | PASS |

## Rule

Until the dual terminology mechanism is resolved by architect decision: **list G1, G2a, and G2b as three baseline lines.** Merging them into one “terminology FAIL” hides the contradiction this document exists to expose.

### G3 intentional findings (baseline red, not silent defects)

| Finding | Canary | Owner | Green when |
|---|---|---|---|
| F-canary-4 | 4 wrong-but-real SNOMED | terminology + interpretation | Gate rejects wrong anatomy binding |
| F-canary-5 | 5 range flag / null interval | fhir-core / connectors | Abstention enforced |
| F-canary-6 | 6 stale as present | interpretation-contract / interpreter | Freshness enforced |
| F-canary-11 | 11 UBERON→FMA reverse | interpretation-contract | Reverse join rejected |

Canary 12 (band-as-interval) must stay **CAUGHT**. Expected aggregate: caught=8, findings=4.
