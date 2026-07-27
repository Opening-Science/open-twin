# open-twin — context for Claude Code

Standing brief for any session working on this codebase.

## What this repository is

**This repository is `etzm/open-twin`, and it is the source of truth.**
`Opening-Science/open-twin` is where the code came from and is now a historical
reference only — it is not kept in sync, and pushing to it is deliberately
disabled. See `PROVENANCE.md` before assuming anything about the other repo, or
before acting on a pull request that lives there.

A pnpm monorepo of health-data connectors that translate vendor APIs and clinical
formats into FHIR R4 bundles, plus a reconciliation layer over them.

| Package | Source |
|---|---|
| `@open-twin/fhir-core` | Shared FHIR building blocks, terminology systems, unit policy |
| `@open-twin/aggregate` | Cross-source reconciliation; abstains without evidence |
| `@open-twin/provider-oura` | Oura Ring v2 API |
| `@open-twin/provider-google-health` | **Google Health API v4** — see the warning below |
| `@open-twin/provider-vitronic` | VITRONIC BodyLoop body scanner |
| `@open-twin/provider-open-wearables` | OpenWearables normalised schema (never verified against a running instance) |
| `@open-twin/fhir-r4` | Foreign FHIR R4 bundles: validation + normalisation |
| `@open-twin/hl7v2` | HL7 v2.x ORU/ADT messages |
| `@open-twin/genomics-vcf` | VCF variant calls via the Genomics Reporting IG |

MIT licensed, developed under the Open Science Foundation.

Documentation map: `README.md` (front door + docs table), `ONBOARDING.md` (first-day
path and the traps), `DECISIONS.md` (before touching any mapper), `BUILD-SUMMARY.md`
(measured state), `PROVENANCE.md` (the other repo), `Contributing.md` (PR workflow).

**`provider-google-health` does not talk to Google Health Connect.** It calls
`health.googleapis.com/v4`, which Google documents as the next generation of the
*Fitbit* Web API; its error catalogue includes `ACCOUNT_NOT_LINKED — The Google
account is not linked to a Fitbit account`, and part of the surface returns
`API_PRIVATE_PREVIEW_ACCESS_DENIED`. Health Connect is a separate, on-device Android
API with no cloud REST surface, unreachable from Node. Do not describe this connector
as a Health Connect connector.

## The one thing to understand before changing anything

**A green test run is not evidence that a change is correct.**

270 tests passed, `tsc --strict` was clean and `biome ci` was clean while the output
carried radians labelled as degrees, an invalid UCUM code, six sleep durations with no
unit at all, and five LOINC/SNOMED codes that mean something other than what the
mapper sends. The tests passed because they assert what the code produces, not what
FHIR requires — and several asserted the defect as intended. One was literally named
*"defaults the root valueQuantity to 0 when score is missing"*.

So when you fix a mapper, expect to change its test in the same commit, and say in the
message that the previous assertion was wrong. Do not leave a test asserting the old
behaviour with a skip on it.

## Ground rules

1. **Never invent a terminology code.** If you cannot verify a code against a primary
   source, use the connector's own code system under `SYSTEMS.*` and leave a `TODO`
   naming what needs clinical sign-off. A local code is recoverable; a wrong standard
   code silently corrupts a clinical exchange.
2. **Re-run every "no standard code exists" claim before acting on it.** This is not
   hypothetical — it has already produced one wrong recommendation in this project.
   See the end of `DECISIONS.md`.
3. **Units must match the data, not just the code.** Check what the API actually
   sends. VITRONIC returns radians; Oura returns seconds; Google Health returns
   millimetres and grams, with int64 fields arriving as JSON *strings*.
4. **Missing data is not zero.** Use `dataAbsentReason`. `numericComponent` in
   `@open-twin/fhir-core` does this for you and requires a unit — that is deliberate.
5. **Never put an API response body into an error message.** These are health
   payloads and they end up in logs. Use `ConnectorError` from `@open-twin/fhir-core`,
   which carries a status, an operation and a code, and no payload.
6. **Read `DECISIONS.md` before adding a mapper.** Subject linkage, ids, code systems
   and units are decided once and shared, not per package.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm lint          # biome
pnpm test          # every package
pnpm typecheck     # tsc --noEmit, every package
pnpm verify        # terminology + UCUM gates

# What CI actually validates against — the official HL7 validator.
pnpm build && pnpm emit-bundles out/
java -jar validator_cli.jar out/*.json -version 4.0.1 -tx n/a -best-practice ignore
```

Both gates fail closed: an unreviewed code is a failure, not a warning. The workflow
is to look each code up **once**, record the official name and who checked it in the
allowlist, and flip it to `approved`. Do not bulk-approve to get a green run — the
whole value of the gate is that approving costs a lookup, which is exactly the step
that was skipped when five wrong codes shipped.

Note what the offline validator does **not** catch: `-tx n/a` degrades terminology
errors to warnings and still exits 0. It buys structure only. The separate
`fhir-terminology` CI job is what catches a code that is well-formed and wrong. And
neither catches radians-labelled-as-degrees, because `1.48 deg` is structurally
perfect — that class needs a fixture with an independently computed expected value.

## Conventions

- Biome for format and lint.
- Branch per issue, named `<issue-number>-<slug>`, merged by PR. Keep this.
- `Contributing.md` is authoritative for the PR workflow and gate procedure. Commit
  signing is deliberately not claimed and not enforced; if that changes it goes
  through branch protection, not prose.
