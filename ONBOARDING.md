# Onboarding

You are new to this repository — a student joining the project, a contributor, or
a Claude Code session opening it for the first time. This is the shortest path to
being productive without breaking the things this codebase exists to protect.

## The mental model, in five sentences

1. Connectors pull health data from vendor APIs (Oura, Google Health, VITRONIC,
   OpenWearables) or ingest clinical formats (FHIR R4, HL7 v2, VCF) and emit
   **FHIR R4 bundles**.
2. Everything a connector must not decide for itself — subject identity, resource
   ids, code systems, units, error hygiene — is decided **once**, in
   `@open-twin/fhir-core`, recorded with reasons in [DECISIONS.md](DECISIONS.md).
3. `@open-twin/aggregate` reconciles overlapping measurements across connectors,
   and refuses to pick a winner when the evidence gives no basis to.
4. Verification combines UCUM checks, recorded terminology reviews and the
   official HL7 validator over registered example bundles. Some checks are
   advisory; a passing run does not establish clinical accuracy.
5. Outputs and diagnostic reports may contain sensitive information. Keep
   payloads out of logs and follow the
   [intended-use and integration guidance](docs/INTENDED-USE.md).

## Day one

```bash
# Toolchain: Node >= 20, pnpm 11. Java 21 only for the optional local validator run.
corepack enable            # or: npm i -g pnpm@11.17.0

pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm verify
```

Blocking checks must pass. Investigate failures in the code or environment;
`pnpm verify` reports advisory findings separately.

Then produce the bundles and look at one:

```bash
pnpm build && pnpm emit-bundles out/
```

`out/` now holds the registered example bundles CI feeds to the HL7 validator. Open one; that is
the product. Everything in this repo exists to make those files correct.

## Verify baseline (read before trusting a red cross)

`pnpm verify` runs every registered gate and reports blocking and advisory results
separately. A passing exit status can include advisory failures.

| Gate | Role | Typical |
|---|---|---|
| `verify/check-terminology.mjs` (allowlist) | Merge-blocking | PASS when no rejected/unknown FHIR codes |
| `verify/check-units.mjs` | Merge-blocking | PASS |
| Module headers / docs integrity | Merge-blocking | PASS when headers/docs intact |
| Review-record gate (G2) | **Advisory** | Review debt remains — see `docs/findings/verify-baseline.md` |
| Canary suite | Blocks on `ACCEPTED`; documented findings do not block | PASS can include four known semantic gaps |

Do not “fix” intentional red by bulk-approving allowlists or deleting canaries.
See `docs/findings/verify-baseline.md` for G1 vs G2a (67 UNVERIFIED Anchor stubs)
vs G2b (non-Anchor debt). Changing this front-door promise needs architect
agreement — it is not an implementation detail.

## Reading order

| # | read | to learn |
|---|---|---|
| 1 | [README.md](README.md) | what the packages are and how they relate |
| 2 | [CLAUDE.md](CLAUDE.md) | the ground rules — written for AI sessions, equally binding advice for humans |
| 3 | [DECISIONS.md](DECISIONS.md) | the cross-cutting decisions, each with the defect that forced it |
| 4 | [BUILD-SUMMARY.md](BUILD-SUMMARY.md) | the measured state: test data per connector, defect history, what is not built |
| 5 | the README of the package you will touch | its API and its verification story |

## The traps (each has already caught someone)

- **Trusting green.** Tests here assert what the code produces. When you fix a
  mapper, change its test in the same commit and say the old assertion was wrong.
- **Inventing a terminology code.** If you cannot verify it against a primary
  source, use the connector's local system under `SYSTEMS.*` plus a
  `TODO(clinical-review)`. A wrong standard code silently corrupts a clinical
  exchange; a local code is recoverable.
- **Trusting a "no standard code exists" claim** — including one you generated
  yourself. Re-verify against a second source; this repo has already recorded one
  wrong such claim (end of DECISIONS.md).
- **Assuming units.** VITRONIC sends radians; Oura sends seconds; Google Health
  sends millimetres, grams, and int64 fields as JSON *strings*. Check the payload,
  not the docs.
- **Zero-filling missing data.** Missing is `dataAbsentReason`, never `0`.
  `numericComponent` in fhir-core does this for you and requires a unit.
- **Describing `provider-google-health` as a Health Connect connector.** It calls
  `health.googleapis.com/v4` — the next-generation *Fitbit* Web API. Health
  Connect is on-device Android, unreachable from Node.
- **Payload in an error.** Use `ConnectorError`. No response bodies, ever.

## Making your first change

1. Branch from `main`: `<issue-number>-<slug>`.
2. Make the change. If it touches what a mapper emits, update the mapper's test
   in the same commit (see trap one) and, if a new code or unit appears, run
   `pnpm verify` — the gate will demand a recorded lookup in the allowlists
   under `verify/`. Look it up once, record the official name and yourself as
   the checker, flip it to `approved`. Never bulk-approve.
3. `pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm verify` — all green.
4. Open a PR. CI adds the HL7 validator (blocking) and a terminology check
   against `tx.fhir.org` (advisory). Say in the PR what would have caught the
   defect you fixed.

## Where the open work is

Honestly listed in [BUILD-SUMMARY.md §5](BUILD-SUMMARY.md): no scheduler, no
persistence, no HTTP surface, delta sync implementable but not implemented.
Beyond that:

- **Clinical review backlog** — every deliberate gap is greppable:
  `grep -rn "TODO(clinical-review)" packages/*/src`. Clearing these needs a named
  clinical reviewer, not code; the list at the end of DECISIONS.md is the
  recruiting brief.
- **Google Health has no independent test data** — the highest-risk connector.
  Anyone with API access who can record one real response fixture moves the
  project more than any refactor.
- **The VITRONIC contradiction** — vendor docs say scans "never leave the
  device"; the connector calls a cloud API. Unresolved; do not build on either
  assumption without checking.
- **`provider-open-wearables` has never met a running instance** — marked
  unverified in its own PR title; treat its fixtures as a hypothesis.

## For Claude Code sessions specifically

[CLAUDE.md](CLAUDE.md) is loaded automatically and is the binding brief; this
file adds the human-onboarding context around it. When memory notes or session
summaries conflict with what `git log` and the gates say, the repo wins. Repository history is recorded in [PROVENANCE.md](PROVENANCE.md).
