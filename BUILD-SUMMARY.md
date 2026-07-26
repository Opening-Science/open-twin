# open-twin — build summary

State of `etzm/open-twin` as of **2026-07-27**, and how it differs from
`Opening-Science/open-twin`.

Every number below was measured, not recalled. Where a claim comes from running a tool,
the tool is named so it can be re-run.

> **Scope.** The figures describe `main` **plus the three open PRs** — #9 (unit rule),
> #10 (real-payload fixtures), #11 (aggregation) — which merge in that order. `main`
> alone today tracks 8 packages, not 9; still passes `--allow-unreviewed` to both
> gates; and has neither `minimalPatient` nor `@open-twin/aggregate`. This document
> may therefore land before the state it describes. Where the distinction matters:
>
> | | `main` today | with #9–#11 |
> |---|---|---|
> | packages | 8 | 9 |
> | gates | `--allow-unreviewed` | strict |
> | validated bundles | 9 | 11 |
> | unit pairs verified | 1 signed | 35 |

---

## 1. Architecture

Four layers. The dependency arrow only ever points down.

```
                    ┌──────────────────────────┐
                    │  @open-twin/aggregate    │   reconcile across sources
                    └────────────┬─────────────┘
                                 │
     ┌───────────┬───────────┬───┴───────┬───────────┬───────────┬───────────┐
     │  oura     │  google-  │ vitronic  │  open-    │  fhir-r4  │  hl7v2 /  │
     │           │  health   │           │ wearables │  (ingest) │ genomics  │
     └───────────┴───────────┴─────┬─────┴───────────┴───────────┴───────────┘
                                   │
                    ┌──────────────┴───────────┐
                    │  @open-twin/fhir-core    │   the shared contract
                    └──────────────┬───────────┘
                                   │
                    ┌──────────────┴───────────┐
                    │  verify/                 │   gates + HL7 validator
                    └──────────────────────────┘
```

### `@open-twin/fhir-core` — the shared contract

Everything a connector must not decide for itself, decided once:

| module | what it settles |
|---|---|
| `systems.ts` | Canonical system URIs, profiles, categories. A code system URI you do not control is not a code system. |
| `units.ts` | The UCUM table. `Quantity.unit` carries **UCUM's own name** for `Quantity.code`, so the two halves cannot drift. |
| `identity.ts` | One subject convention (D1), deterministic ids (D2), `minimalPatient` to answer a minted reference. |
| `observation.ts` | `createObservation`, and `numericComponent` which **requires** a unit and falls back to `dataAbsentReason`. |
| `bundle.ts` | `buildBundle`, lowercase `urn:uuid:` fullUrls, connector provenance tag. |
| `provenance.ts` | `Device`, `METHOD` vocabulary, `derivedObservation`. |
| `reliability.ts` | Graded validation evidence per **(source, measure)**, with citations. |
| `referenceRange.ts` | Anchor-layer intervals on the Observation, each carrying its source. |
| `errors.ts` | `ConnectorError` — status, operation, code, and **never a response body**. |

### `verify/` — the part that makes a green run mean something

The project's founding observation is that **a green test run is not evidence of
correctness**: 270 tests passed while the output carried radians labelled as degrees, an
invalid UCUM code, and five codes meaning something other than what the mapper sent.
Several tests asserted the defect as intended.

So correctness is checked against external authority instead:

| gate | authority | catches |
|---|---|---|
| `check-units.mjs` | the published UCUM grammar via `@lhncbc/ucum-lhc` | invalid codes, unitless Quantities, a `unit` that disagrees with its `code` |
| `check-terminology.mjs` | recorded human review + `tx.fhir.org` displays | a code that is well-formed and **wrong** |
| `build-conformance.mjs` | generates StructureDefinitions from `declarations.json` | an extension emitted but never declared |
| HL7 `validator_cli.jar` | the official validator | structure, invariants, profiles, unresolved references |

Both gates now run **strict** in CI. The `--allow-unreviewed` waiver is gone.

**What none of them catch:** that the *value* is in the unit claimed. `1.48 deg` is
structurally perfect whether or not the source sent radians. That class needs a fixture
with an independently computed expected value, which is why at-risk unit pairs carry a
`guarded_by` note naming the numeric tests protecting them.

---

## 2. Connectors

Nine packages. Seven map or ingest; two are infrastructure.

| package | direction | source |
|---|---|---|
| `fhir-core` | — | shared contract |
| `aggregate` | — | cross-source reconciliation |
| `provider-oura` | vendor → FHIR | Oura Ring v2 API |
| `provider-google-health` | vendor → FHIR | **Google Health API v4** (see below) |
| `provider-vitronic` | vendor → FHIR | VITRONIC BodyLoop body scanner |
| `provider-open-wearables` | vendor → FHIR | OpenWearables normalised schema |
| `fhir-r4` | FHIR → FHIR | foreign R4 bundles, normalised |
| `hl7v2` | HL7 v2 → FHIR | ORU/ADT messages |
| `genomics-vcf` | VCF → FHIR | variant calls, Genomics Reporting IG |

> **`provider-google-health` does not talk to Google Health Connect.** It calls
> `health.googleapis.com/v4`, which Google documents as the next generation of the
> *Fitbit* Web API — its error catalogue includes `ACCOUNT_NOT_LINKED — The Google
> account is not linked to a Fitbit account`. Health Connect is a separate on-device
> Android API with no cloud REST surface, unreachable from Node. A separate Fitbit
> connector should be struck from the roadmap: Fitbit is reached *through this one*.

### `@open-twin/aggregate`

Gives `derivedObservation` and `reliabilityFor` their first caller. Takes bundles from
several connectors for one subject and returns one bundle.

- **every source Observation survives** — a reconciliation is an added assertion, so
  changing the policy later is a re-run, not a re-fetch from a vendor who may no longer
  serve the window;
- **where the evidence gives no basis to prefer a source, none is preferred.**

The refusals are the substance. Energy expenditure abstains outright — published MAPE
above 30% for every brand tested, so naming a winner would present a confidence nobody
has earned. Equally graded sources abstain rather than break a tie on array order.

Sleep duration selects **google-health over Oura**, which reads backwards until you
look: Oura's `good` grade is for sleep-wake *detection*, and it has no published
total-sleep-time finding at all. That is the per-measure distinction `reliability.ts`
exists to make, arriving on its own.

---

## 3. Test data — what can be benchmarked, and what cannot

This is the honest picture, and it is uneven.

### Benchmarked against real, independently-sourced data

| connector | data | why it is an oracle |
|---|---|---|
| **provider-oura** | Oura public sandbox — 13 scopes, 73 records, captured 2026-07-26 | Produced by Oura, so it can *disagree* with us. Runs through schemas **and** mappers to a validated bundle (`oura-sandbox-real`). |
| **genomics-vcf** | htsjdk `HiSeq.10000.vcf`, dbSNP b37 — verbatim public test data | Byte-identical excerpts; lines kept or dropped whole. A tidied fixture stops being an oracle. |
| **fhir-r4** | HL7's own published R4 examples (lipids, vitals, body height) | Foreign payloads with their own ids, `fullUrl` bases, and dangling references — exactly what normalisation must survive. |
| **hl7v2** | HL7 v2-to-FHIR IG published test conversions | The IG's own expected conversions, not ours. |

### Partially benchmarked

| connector | data | the gap |
|---|---|---|
| **provider-vitronic** | The recorded response shipped with the handover — including the **radian angles** the unit conversion is checked against | Real payload, but no live scanner. Cannot confirm the API still sends this shape. |
| **provider-open-wearables** | Verbatim from the project's own published test payloads | Never run against a running instance. Marked *unverified* in its own PR title. |

### Not benchmarked at all

| connector | why not |
|---|---|
| **provider-google-health** | **There is no sandbox or synthetic-data environment.** Access needs a Google account *linked to a Fitbit account*, and part of the surface returns `API_PRIVATE_PREVIEW_ACCESS_DENIED` (403). Its fixture is shaped from real response documentation — int64 as JSON strings, millimetres, grams, `utcOffset` — but nothing has been recorded from the live API. |

**This is the single biggest remaining risk.** The connector most likely to be wrong in
a way no test can see is the one with no independent data, and the Oura exercise showed
exactly what real data finds: driving the recorded capture through the mappers exposed
six undeclared extensions and 73 dangling subject references that every green run had
been reporting as `Success`.

### Everything reaching the HL7 validator

11 bundles, **0 errors, 0 unresolved references**:

```
anchor-hba1c         fhir-core-exemplar    oura-sync           oura-sandbox-real
aggregate-two-sources    google-health-sync    vitronic-scan   fhir-r4-ingest
hl7v2-oru-r01        genomics-vcf-hiseq    open-wearables-sync
```

---

## 4. Comparison with `Opening-Science/open-twin`

Baseline is `688728f`, the tip of Opening-Science `main` — i.e. **before** its 8 open
PRs (#68–#75), which are the same work now merged here.

### At a glance

| | Opening-Science (pre-PR) | etzm (now) |
|---|---|---|
| packages | 3 | **9** |
| test files | 30 | **72** |
| tests | — | **1047** |
| source LOC | 10,207 | **36,637** |
| shared FHIR core | ✗ absent | ✓ `@open-twin/fhir-core` |
| verification gates | ✗ absent | ✓ 2, both strict |
| HL7 validator in CI | ✗ none | ✓ 11 bundles, 0 errors |
| conformance declarations | ✗ none | ✓ 22 extensions |
| terminology signed off | ✗ none | ✓ 72 codes |
| unit pairs verified | ✗ none | ✓ 35 (31 by UCUM lookup) |
| real vendor test data | ✗ none | ✓ 4 connectors |

### Defects in the Opening-Science tree

Measured by running **today's gates against that tree** — reproduce with
`node verify/check-units.mjs <path>` and `check-terminology.mjs <path>`.

**Terminology — 5 codes that mean something other than what the mapper sends**

| code | file | |
|---|---|---|
| `11524-6` | `google-health/session.ts:17` | *EKG study … Scale: **Doc*** — a document code, used for a numeric observation |
| `248263006` (SNOMED) | `oura/sleep.ts:44` | sent as "Sleep efficiency"; means *Duration of sleep* |
| `60842-2` | `oura/vo2max.ts:29` | absolute VO₂, used for a weight-indexed value |
| `77195-6` | `oura/cardiovascular.ts:23` | sent as "Vascular age"; means *Cardio-ankle vascular index* |
| `99501-9` | `oura/personal.ts:118` | sent as "Sex assigned at birth"; means *Sex parameter for clinical use* |

Plus **15 wrong display names** — codes correct, names not.

**Units — 3 invalid, 3 malformed, 19 name mismatches**

| pair | file | consequence |
|---|---|---|
| `MET-min` / `min` | `oura/daily.ts:137` (+3) | a conformant parser discards annotations, so a receiver reads **300 MET-minutes as 300 minutes of activity** |
| `steps` / `steps` | `oura/daily.ts:280` | `steps` is not a UCUM code; a validating server rejects it |
| `°C` / `Cel` | `oura/readiness.ts:99` (+1) | used for a temperature *deviation*; `Cel` is a point on a scale, a difference is `K` |

Three Quantities carry a value with **no unit and no code at all** — a bare,
uninterpretable number — in `google-health/shared.ts:84`, `oura/sleep.ts:21`,
`vitronic/shared.ts:46`.

**Subject attribution — every Observation misattributed**

```
20 ×  reference: 'Patient/example'
 1 ×  reference: 'Scan/xyz'
 1 ×  reference: 'Scan/scan-1'
```

`Scan` is not a FHIR resource type. On ingestion, everything becomes silently
attributable to whatever `Patient/example` happens to exist on the receiving server.

**Structural**

- no shared core — subject linkage, ids, code systems and units decided per package,
  differently
- no verification of any kind: no unit gate, no terminology gate, no conformance
  declarations, no HL7 validator
- CI is 3 publish workflows; nothing validates FHIR output
- no real vendor data anywhere — every fixture written by the same author as the mapper
  it tests, so it cannot contradict the code

### On the earlier assessment

The handover package claimed 50 defects. Verifying each: **52 confirmed, 9 corrected**
(the claim was wrong or the reasoning was), and **57 further defects found** that it had
not identified. Git history shows every one entered on first authorship (2026-06-23 to
2026-07-22) — they did not creep in. Nothing existed that could have caught them.

---

## 5. What is not built

Named plainly, because the gap between "library" and "system" is where expectations go
wrong.

| | status |
|---|---|
| Per-connector pipeline: auth → fetch → parse → map → validated Bundle | ✓ working, all 7 |
| Cross-connector reconciliation | ✓ `@open-twin/aggregate` |
| **Orchestrator / scheduler** | ✗ nothing runs connectors on a schedule |
| **Persistence** | ✗ no store; bundles are returned, not kept |
| **HTTP / FHIR server surface** | ✗ none |
| **Delta sync** | ✗ ids are deterministic so it is *implementable*, not implemented |
| **Anchor layer beyond Phase 1** | ✗ `referenceRange` exists; Synthea integration does not |

Open questions carried forward:

1. **Google Health has no independent test data.** The highest-risk connector.
2. **The VITRONIC contradiction** — the documentation says body scans "never leave the
   device"; the connector calls a cloud API. Unresolved.
3. **Peter's processed Anchor workbook** — the delivered file is Robin's original (422
   rows, 2 columns), not the processed version with units and reference ranges.
4. **Five day-extensions carry an ISO date as `string`.** `date` is arguably right;
   changing three of five would leave them inconsistent with the two that shipped.

---

## 6. Reproducing this

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm -r build
pnpm -r test                          # 1047
node verify/check-terminology.mjs     # strict
node verify/check-units.mjs           # strict
node verify/build-conformance.mjs
npx tsx verify/emit-bundles.ts out/
java -jar validator_cli.jar out/*.json -version 4.0.1 -tx n/a \
     -best-practice ignore -ig verify/conformance/generated
```

Note what the offline validator does **not** do: `-tx n/a` degrades terminology errors
to warnings and still exits 0. It buys structure only. The separate `fhir-terminology`
CI job is what catches a code that is well-formed and wrong.
