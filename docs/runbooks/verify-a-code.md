# Runbook: verify a terminology code

Human procedure for signing a review record. Machines must not invent codes or
fill verification fields.

## Vocabularies

See [`docs/strategy/06_ADDENDUM_SYSTEMID_AND_TERMINOLOGY.md`](../strategy/06_ADDENDUM_SYSTEMID_AND_TERMINOLOGY.md).
Pick the vocabulary that matches the **job** (measurement vs unit vs internal
clinical semantics vs mesh key vs query key).

## Steps

1. Identify the code and vocabulary found by `scripts/check-terminology.ts`
   (or the stub under `docs/terminology/review-records/`).
2. Look it up in the **authoritative** source:
   - LOINC: https://loinc.org/{code}
   - UCUM: the UCUM specification / validated via `@lhncbc/ucum-lhc`
   - SNOMED CT: national release browser (Affiliate access) — internal use only
   - FMA: FMA release / BioPortal FMA
   - UBERON: https://www.ebi.ac.uk/ols4/ontologies/uberon
3. Open or create `docs/terminology/review-records/{VOCAB}-{code}.md`.
4. Fill **every** field:
   - `code`, `vocabulary`, `binds_to` (biomarker or anatomical structure)
   - `official_display_name` — the authority's own name, not a paraphrase
   - `source_url` — permalink to the page or release you used
   - `retrieval_date` — ISO date you retrieved it
   - `human_reviewer_name` — your name
   - `date_signed` — ISO date you signed
5. Replace any literal `UNVERIFIED` verification fields with real values.
6. Run `pnpm exec tsx scripts/check-terminology.ts` and confirm this code is no
   longer listed.
7. Commit the record with a message that names the code and the authority URL.

## When you believe no standard code exists

1. **Re-check** against a second independent source (Addendum / project ground
   rule). Do not trust a prior AI claim or an old note.
2. If still absent, **escalate** to the named clinical reviewer with:
   - what you searched
   - both sources
   - what concept you need
3. **Never invent** a LOINC, SNOMED, UCUM, FMA, or UBERON code.
4. For measurements that must ship before a standard code is agreed, use a
   Foundation-controlled vendor-local code under `SYSTEMS.*` and leave a signed
   review note that the local code is intentional — still not an invented
   standard code.

## Worked example (shape only)

Signing Anchor HbA1c after human lookup (illustrative values — do not copy as
fact without checking loinc.org yourself):

```yaml
vocabulary: LOINC
code: "4548-4"
binds_to: "HbA1c"
official_display_name: "Hemoglobin A1c/Hemoglobin.total in Blood"
source_url: "https://loinc.org/4548-4"
retrieval_date: "2026-08-02"
human_reviewer_name: "Example Reviewer"
date_signed: "2026-08-02"
```

Until those verification fields leave `UNVERIFIED`, the terminology gate stays
red for this code on purpose.
