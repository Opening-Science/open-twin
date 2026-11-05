# Fixture provenance

`synthea/patient-1.json` to `patient-3.json` are Synthea output: a synthetic population,
no real person behind any record. Each bundle was trimmed to one Patient and five
Observations when it was added (commit 4ef7dee, 2026-09-08, issue #78); the names, ids
and dates are Synthea's generated values. The Synthea recipe that produced them now
lives in [opentwin-synthea](https://github.com/Opening-Science/opentwin-synthea) (#228).

`synthea/patient-N.expected.json` is the `summarise` output for that bundle as read by
`FhirR4Reader` with subject key `synthea-patient-N` on a fixed clock. Regenerate it with
`summarise` from `@open-twin/reader-core` when a fixture or the normaliser changes,
never by hand.

`invalid-bundles.ts` is hand-written: each case breaks one rule on purpose.
