# Contract: Anchor organ / region → SystemId

Implements the curated mapping used by `scripts/compile-anchor-layer.ts`
(`interpretive_anatomy_source: "curated_table"`).

`SystemId` is the nine-value health-data contract (openXR `src/data/schema.ts` /
Addendum 06). Region ids come from the workbook `Region_Enum` /
`Organ_Mapping_Crosswalk`.

| Primary `region_id` | `system_id` |
|---|---|
| liver, biliary, gut | digestive |
| heart, vasculature, lipid_transport | cardiovascular |
| brain, sleep_recovery | nervous |
| bone, skeletal_muscle, body_composition | musculoskeletal |
| thyroid, parathyroid, pituitary, adrenal, pancreas_endocrine | endocrine |
| gonads, prostate | reproductive |
| kidney, micronutrient_status, electrolyte_balance, metabolic_glycemic, systemic_inflammation, immune, bone_marrow_blood | metabolic |

When `region_ids` is a pipe-separated list, the **first** region determines
`system_id`. Markers whose organ token is RETIRE'd in the crosswalk still carry
the workbook's assigned `region_ids`.

If this table is wrong, record an ADR — do not silently invent a tenth SystemId.
