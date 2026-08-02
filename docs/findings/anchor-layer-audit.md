# Anchor layer audit

Source: `docs/evidence/source/2026_07_28_OpenTwin_AnchorLayer_v3_Consolidated.xlsx`  
Source sha256: `4f4eb4d70966a2d2bf653be1cfec02b5e35f6f0d7ad0eed661b3e80bd369976d`  
Artefact: `packages/anchor-layer/data/anchor-layer.v1.json`  
Artefact sha256: `f5024b68b182ab285d937462aef780d7dc6d1dbe1dd6aac1fad2af27b7890a26`

## Counts (D-c — do not merge)

Reference intervals and interpretive bands are different kinds. A prior workbook README
headline ("31 markers with an interval") **conflated** them; that source number was
wrong for abstention purposes and is corrected here rather than quietly reused.

| Metric | Value | Notes |
|---|---:|---|
| Biomarkers | 67 | expected 67 |
| Reference intervals (`record_kind=reference_interval`) | 93 | expected 93 |
| Interpretive bands (`record_kind=interpretive_band`) | 5 | expected 5 |
| `counts.markers_with_reference_interval` | 30 | measured assay intervals only |
| `counts.markers_with_interpretive_band_only` | 1 | band(s), no reference interval |
| `counts.markers_with_neither` | 36 | abstain — no measured interval |
| Property mismatches (molar LOINC + mass unit) | 3 | expected 3 |

Superseded conflated headline (do not use): "31 with interval / 36 without" mixed RI∨band.

### By tier

- `core_tier1`: 35
- `core_tier2`: 18
- `core_tier1_decomposed`: 14

## Markers with interpretive band only (not a reference interval)

- **BM-190 LDL-Cholesterin** — interpretive bands only (no `reference_interval`). Bands are already an interpretation (optimal / gut / grenzwertig / erhöht / pathologisch); they must not stand in for a measured interval (D-a, D-c).

## Markers with neither reference interval nor band (abstain)

- BM-014 Anti-Müller-Hormon (AMH)
- BM-057 Biotin (Vitamin B7)
- BM-078 Creatinkinase (CK)
- BM-130 GOT (ASAT)
- BM-154 Holotranscobalamin (aktives B12)
- BM-156 Homocystein
- BM-176 Jod
- BM-186 Kupfer
- BM-200 Lipoprotein (a)
- BM-299 Parathormon (PTH)
- BM-315 PSA
- BM-341 Selen
- BM-346 SHBG
- BM-392 Vitamin A
- BM-393 Vitamin B1 (Thiamin)
- BM-395 Vitamin B2 (Riboflavin)
- BM-397 Vitamin B5 (Pantothensäure)
- BM-398 Vitamin B6
- BM-401 Vitamin D (25-OH)
- BM-404 Vitamin E
- BM-405 Vitamin K
- BM-411 Zink
- BM-423 Hämoglobin
- BM-424 Hämatokrit
- BM-425 Erythrozyten
- BM-426 Leukozyten
- BM-427 Thrombozyten
- BM-428 MCV
- BM-429 MCH
- BM-430 MCHC
- BM-431 IgA
- BM-432 IgG
- BM-433 IgM
- BM-434 CTX (Beta-Crosslaps)
- BM-435 Desoxypyridinolin (DPD)
- BM-436 Kreatinin

## Property mismatches (D-e) — compiler FAIL condition

- **BM-060** Bor: LOINC `52914-9` (Boron [Moles/volume] in Serum or Plasma) with unit `µg/l` / UCUM `ug/L`
- **BM-186** Kupfer: LOINC `14665-4` (Copper [Moles/volume] in Serum or Plasma) with unit `µg/l` / UCUM `ug/L`
- **BM-405** Vitamin K: LOINC `58793-1` (Phytonadione [Moles/volume] in Serum or Plasma) with unit `ng/l` / UCUM `ng/L`

Expected IDs detected: yes (BM-060, BM-186, BM-405)  
Unexpected mismatches: 0

## UCUM validation

Failures (grammar library rejected `unit_ucum`):

_none_

Disagreements with German blood-count notation (D-d):

_none_

## Notes

- Biomarker records do **not** carry `(low, high)` (D-b).
- Interpretive bands are a separate array from reference intervals (D-c).
- `system_id` comes from `docs/contracts/anchor-organ-to-system.md` (curated_table).
