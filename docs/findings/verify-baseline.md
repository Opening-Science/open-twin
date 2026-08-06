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
| What it answers | Does every LOINC/UCUM/SNOMED/FMA/UBERON literal in `src/` have either a signed markdown review record (verification fields present and not the literal `UNVERIFIED`) **or** a G1 allowlist entry with status `APPROVED` whose declared `system` matches that vocabulary? |
| Current | **FAIL(advisory)** — see G2a and G2b separately |
| Intentional red? | Partially — see sub-rows |

### G2a — 67 UNVERIFIED Anchor stubs (deliberate work queue)

| Field | Value |
|---|---|
| Origin | P2 created stub records for all 67 Anchor-core LOINC codes with verification fields left `UNVERIFIED` |
| Owner | Clinical reviewer (human sign-off per `docs/runbooks/verify-a-code.md`) |
| Resolution | Sign each record; do not bulk-approve |
| Must not absorb | G2b |

### G2b — 20 MISSING non-Anchor review records (pre-existing debt)

| Field | Value |
|---|---|
| Origin | Codes already in connectors / samples / genomics that have **no** signed review record and are **not** G1 `APPROVED`. Discovered when P2’s gate scanned beyond Anchor; 31 of the historical “51 MISSING” were G1 overlaps and are no longer counted. |
| Owner | Engineering + clinical review (pre-existing debt, not a P2-created queue) |
| Current count | **20** true MISSING (15 LOINC + 5 UCUM). G1 cover: 31. See `docs/findings/missing-non-anchor-review-records.md`. |
| Must not absorb | G2a |

### G3 — Canary suite (`verify/check-canaries.ts`, when registered)

| Field | Value |
|---|---|
| Home | `verify/canaries/` + `verify/check-canaries.ts` (when registered) |
| Current | **PASS** (exit 0) with 4 documented `FINDING:UNCAUGHT`; **FAIL** only if any canary is `ACCEPTED` |
| Intentional findings | 04, 05, 06, 11 (no existing semantic gate) — do not paper over; findings are logged, not merge-blocking |
| Caught (incl. wrong-kind band) | 01, 02, 03, 07, 08, 09, 10, 12 |

### Module headers (`verify/check-headers.ts`)

| Field | Value |
|---|---|
| Home | `verify/check-headers.ts` + CI step in `gates` / `run-verify` |
| On this tip (gate registered, headers not applied) | **FAIL(advisory)** — hundreds of exporting modules lack the convention block |
| After `open-twin/module-headers` | **PASS**, gate promoted to blocking |
| Intentional red? | Yes, until that branch lands |

### Other gates

| Gate | Script | Typical |
|---|---|---|
| UCUM units | `verify/check-units.mjs` | PASS |
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
