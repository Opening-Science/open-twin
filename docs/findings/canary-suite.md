# Canary suite — deliberately wrong inputs

Status: binding for CI (`verify/check-canaries.ts`).

These fixtures exist because this repository has already shipped **270 passing
tests over clinically wrong output**. Green tests are not evidence. The canary
suite asks the opposite question: *does an existing gate reject this wrong
input?* CI fails if any canary is **accepted**.

Rule: if a canary is not caught by an existing gate, that is a **FINDING**.
Do not paper over it with a fixture-specific special case.

## Matrix

| # | Canary | Expected rejection | Specific gate | Status |
|---|---|---|---|---|
| 1 | Angular value in radians incorrectly emitted as `deg` (BodyLoop `1.48165…`) | Must emit ~84.8923 `deg`, never ~1.48 `deg` | `packages/provider-vitronic/.../shared.ts#radiansToDegrees` (D10) | caught by harness |
| 2 | Bor µg/L vs LOINC 52914-9 `[Moles/volume]` | Property mismatch FAIL, no auto-fix | `detectPropertyMismatches` / `compile-anchor-layer.ts` (D-e) | caught by harness |
| 3 | Fabricated LOINC `99999-5` | Missing / unsigned review record | `verify/check-terminology.ts` | caught by harness |
| 4 | Real SNOMED, **wrong** body structure | Semantic reject of wrong anatomy binding | **none** | **FINDING:UNCAUGHT** |
| 5 | Reference-range / interpretation flag when interval is null | Must abstain; no H/L flag without an interval | **none** | **FINDING:UNCAUGHT** |
| 6 | Observation older than freshness window as `status=present` | Must be `stale` or refused (`confidence.md`) | **none** | **FINDING:UNCAUGHT** |
| 7 | `sufficient_data=true` + empty `contributing[]` | `EMPTY_CONTRIBUTING` | `validateInterpretationDocument` | caught by harness |
| 8 | Anatomy from LOINC System axis (D-h) | `LOINC_SYSTEM_AXIS_ANATOMY` | `validateInterpretationDocument` | caught by harness |
| 9 | SCTID in a published-artefact path | SNOMED publication boundary FAIL | `verify/check-snomed-boundary.ts` | caught by harness |
| 10 | CBC marker rerouted into `cardiovascular` | `UNRENDERABLE_REROUTED` (D-g) | `validateInterpretationDocument` | caught by harness |
| 11 | UBERON→FMA join (wrong direction, D-l) | Reverse join rejected | **none** | **FINDING:UNCAUGHT** |
| 12 | Interpretive band used as measured interval (BM-190 / RI-079) | Reject wrong-kind interval (D-c) | `mapBiomarkerToObservation` → `interpretive_band_not_reference_interval` | caught by harness |

## Findings (gaps)

### F-canary-4 — Wrong-but-real SNOMED body structure

**Owner:** terminology + interpretation.
**Green when:** a gate rejects SCTID that is real but bound to the wrong body structure / system_id.

`check-snomed-boundary` and interpretation SCTID rules only police **presence in
published artefacts**. `check-terminology` only requires a signed review record
for a code that appears in source. Nothing checks that SCTID *X* is the correct
structure for `system_id` / `fma_id` *Y*.

### F-canary-5 — Range flag with null interval

**Owner:** fhir-core / connectors.
**Green when:** Observations carrying interpretation/referenceRange while the authoritative interval is null are rejected or stripped to abstention.

`fhir-core` omits `referenceRange` when the builder is given none. It does not
reject an Observation that already carries `interpretation` / `referenceRange`
while the authoritative interval is null (D-a abstention).

### F-canary-6 — Stale observation interpreted as present

**Owner:** interpretation-contract / interpreter.
**Green when:** `status=present` with `observed_at` older than the freshness window is rejected or forced to `stale`.

`docs/contracts/confidence.md` defines recency for the confidence product.
`validateInterpretationDocument` does not enforce `status` vs `as_of` age.
A contributor with `status: "present"` and `observed_at` older than 180 days is
accepted today.

### F-canary-11 — Reverse UBERON→FMA join

**Owner:** interpretation-contract.
**Green when:** a reverse UBERON→FMA join_declaration fails conformance.

D-l requires joins FMA→UBERON only. The schema requires `fma_id` and documents
direction; there is **no bridge/direction validator**. A document with a reverse
`join_declaration` still passes conformance.

## Invoke

```bash
pnpm exec tsx verify/check-canaries.ts
```

Wired into `pnpm verify` and the CI `gates` job. Fixtures live under
`verify/canaries/` (not a published-artefact path).
