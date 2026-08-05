# Interpretation contract — changelog

## v0.2 — 2026-08-02

Sole published interface between open-twin interpretation and open-twin-openXR
visualisation. Schema:
[`interpretation-contract.v0.2.schema.json`](./interpretation-contract.v0.2.schema.json).

Binding decisions landed: **D-f … D-m**. See
[D12](../../DECISIONS.md#d12) (region key, rejected alternatives) and
[D13](../../DECISIONS.md#d13) (MDR intended-use line).

Notable constraints:

- Region key is `system_id` with the nine openXR `SystemId` values only (D-f).
- Markers with no SystemId home go in top-level `unrenderable[]` (D-g).
- Interpretive anatomy from curated organ mapping only; `loinc_system_axis`
  rejected (D-h).
- Severity ordinal; confidence is rule-support, not disease probability (D-i, D-j).
- Insufficient data still emitted; contributing includes absences (D-k).
- Geometry: `fma_id` primary, `uberon_id` secondary; SNOMED body structure
  internal-only / never in published documents (D-l).
- `intended_use` + `not_for_diagnostic_use` on every document (D-m).

Package: `@open-twin/interpretation-contract` (schema, generated types,
conformance validator, reject fixtures).

## v0.1 — superseded

Draft `docs/strategy/03_INTERPRETATION_CONTRACT_v0.1.md` is superseded by v0.2.
Where v0.1 conflicted with D-f…D-m (parallel region vocabulary, float severity /
risk-shaped confidence, LOINC System-axis anatomy), v0.2 wins. The v0.1 file was
not present in-tree when v0.2 landed; this changelog is the supersession record.
