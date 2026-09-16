# open-twin

Health-data connectors that translate vendor APIs and clinical formats into
**validated FHIR R4 bundles**, plus the layer that reconciles them. A pnpm
monorepo, MIT licensed, developed under the Open Science Foundation.

This repository (`etzm/open-twin`) is the **source of truth**;
`Opening-Science/open-twin` is where the code came from and is now a historical
reference — see [PROVENANCE.md](PROVENANCE.md) before assuming anything about it.

## The premise

**A green test run is not evidence that a bundle is correct.** This project's
founding observation: 270 tests once passed while the output carried radians
labelled as degrees, an invalid UCUM code, and five LOINC/SNOMED codes meaning
something other than what the mapper sent — several tests asserted the defects as
intended. So correctness here is checked against **external authority** instead:
the published UCUM grammar, a recorded human review of every terminology code, and
the official HL7 validator over every bundle the repo can emit. The gates fail
closed. The story is told in full in [BUILD-SUMMARY.md](BUILD-SUMMARY.md).

## Packages

Nine packages. Seven map or ingest; two are infrastructure.

| package | direction | source |
|---|---|---|
| [`fhir-core`](packages/fhir-core) | — | the shared contract: systems, units, identity, provenance, errors |
| [`aggregate`](packages/aggregate) | — | cross-source reconciliation |
| [`provider-oura`](packages/provider-oura) | vendor → FHIR | Oura Ring v2 API |
| [`provider-whoop`](packages/provider-whoop) | vendor → FHIR | WHOOP Developer API v2 |
| [`provider-google-health`](packages/provider-google-health) | vendor → FHIR | **Google Health API v4** (see warning) |
| [`provider-vitronic`](packages/provider-vitronic) | vendor → FHIR | VITRONIC BodyLoop body scanner |
| [`provider-open-wearables`](packages/provider-open-wearables) | vendor → FHIR | OpenWearables normalised schema |
| [`fhir-r4`](packages/fhir-r4) | FHIR → FHIR | foreign R4 bundles: validation + normalisation |
| [`hl7v2`](packages/hl7v2) | HL7 v2 → FHIR | ORU/ADT messages |
| [`genomics-vcf`](packages/genomics-vcf) | VCF → FHIR | variant calls, Genomics Reporting IG |

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

The dependency arrow only ever points down.

> ⚠️ **`provider-google-health` does not talk to Google Health Connect.** It calls
> `health.googleapis.com/v4`, which Google documents as the next generation of the
> *Fitbit* Web API. Health Connect is a separate, on-device Android API with no
> cloud REST surface, unreachable from Node. Do not describe this connector as a
> Health Connect connector — and do not add a separate Fitbit connector to any
> roadmap: Fitbit is reached *through this one*.

## Getting started

Prerequisites: **Node ≥ 20** (CI uses 22) and **pnpm 11** (pinned via
`packageManager`; `corepack enable` gives you the right one, or
`npm i -g pnpm@11.17.0`). Java 21 only if you want to run the HL7 validator
locally — CI runs it for you on every PR.

```bash
pnpm install --frozen-lockfile
pnpm lint          # biome
pnpm test          # every package (1051 tests at the time of writing)
pnpm typecheck     # tsc --noEmit, every package
pnpm verify        # terminology + UCUM gates — fail closed
```

To produce and validate the bundles CI validates:

```bash
pnpm build && pnpm emit-bundles out/
java -jar validator_cli.jar out/*.json -version 4.0.1 -tx n/a -best-practice ignore
```

Note what the offline validator does **not** catch: `-tx n/a` degrades terminology
errors to warnings and still exits 0 — it buys structure only. The separate
`fhir-terminology` CI job (against `tx.fhir.org`) catches a code that is
well-formed and wrong. And neither catches radians-labelled-as-degrees, because
`1.48 deg` is structurally perfect — that class needs a fixture with an
independently computed expected value.

## Synthetic patients (Synthea)
Java 21+: `./tools/synthea/generate.sh` → reproducible N=100 FHIR R4 cohort under
`tools/synthea/out/` (not committed). Details: [docs/synthea.md](docs/synthea.md).
## Documentation map

Written to be equally legible to a human contributor and to a Claude Code session
working in this repo — same facts, one place each.

| document | read it when |
|---|---|
| [ONBOARDING.md](ONBOARDING.md) | you are new here — first-day path, mental model, the traps |
| [CLAUDE.md](CLAUDE.md) | standing brief for AI coding sessions (ground rules, verification) |
| [DECISIONS.md](DECISIONS.md) | **before adding or changing a mapper** — subject linkage, ids, code systems, units |
| [BUILD-SUMMARY.md](BUILD-SUMMARY.md) | you want the measured state: architecture, test data, defect history, what is not built |
| [PROVENANCE.md](PROVENANCE.md) | anything involving the Opening-Science repository |
| [docs/synthea.md](docs/synthea.md) | reproducible Synthea FHIR generation (recipe only) |
| [Contributing.md](Contributing.md) | you are about to open a PR |
| `packages/*/README.md` | you are working inside one package |

## What this is not (yet)

A library, not a system: there is no scheduler, no persistence, no HTTP surface.
Per-connector pipelines and cross-source aggregation work end to end; what remains
is listed honestly in [BUILD-SUMMARY.md §5](BUILD-SUMMARY.md).

## Disclaimer

This project is an independent and unofficial integration for the supported
services and devices. It is not affiliated with, endorsed by, sponsored by, or
otherwise associated with any of the vendors involved.

## License

[MIT](LICENSE)
