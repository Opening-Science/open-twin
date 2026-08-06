# Synthea coverage of the Anchor core set (67)

Status: **inventory only** — no custom modules written yet.

Source of stock scan: `synthetichealth/synthea` modules under
`src/main/resources/modules` (242 JSON files), matching LOINC codes where
`system` is `LOINC` or `http://loinc.org`.

Provenance:
- **Synthea revision:** `7e08387c68a7f0e21d13076609a159fd473fc902` (2026-07-22, `master` tip at scan)
- **Scan date:** 2026-08-02
- **Command:** sparse-clone modules, then walk every `*.json` under
  `src/main/resources/modules` for coding objects whose `system` is `LOINC`
  or `http://loinc.org`, intersected with the 67 Anchor LOINCs from
  `packages/anchor-layer/data/anchor-layer.v1.json`:

```bash
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/synthetichealth/synthea.git
cd synthea && git sparse-checkout set src/main/resources/modules
git rev-parse HEAD   # → 7e08387c68a7…
find src/main/resources/modules -name '*.json' | wc -l   # → 242
# then: JSON walk for system∈{LOINC, http://loinc.org} × Anchor LOINC set
```

## Summary

| Status | Count | Meaning |
|---|---:|---|
| **stock** | 23 | Exact Anchor LOINC appears in a stock Synthea module |
| **custom** | 36 | Not emitted under the Anchor LOINC; a Generic Module *could* emit it, or stock has a sibling LOINC only |
| **cannot** | 8 | No *honest* OpenTwin emission — fabricating a value would violate Anchor coherence or an unresolved LOINC/unit decision (not a claim that Synthea lacks Observation states) |
| **total** | 67 | |

## Method notes

- **Exact LOINC wins.** Sibling codes (e.g. calcium `17861-6` mass vs Anchor
  `2000-8` moles; LDL `18262-6` direct vs `2089-1`) are **custom**, not stock,
  because `@open-twin/provider-anchor` keys the Anchor LOINC.
- **CBC indices.** Stock modules list MCV/MCH/MCHC with *independent* `range`
  objects beside Hb/Hct/RBC. They are stock for LOINC presence, but **not**
  formula-coherent. Coherence is a later test obligation (task §4), not a stock guarantee.
- **`cannot` is honesty policy, not missing Generic Module capability.** Synthea
  Generic Modules can emit numeric Observations (exact / range / distribution /
  attribute / expression) and support Delay, Guard, SetAttribute, and optional
  Physiology states. That does **not** make an unphased random estradiol or a
  molar-LOINC/mass-unit Bor an honest Anchor Observation. `cannot` rows stay
  out of the P7 custom-module work list until the cited blocker is resolved;
  reclassifying them as `custom` would schedule modules nobody should ship.
- **v0.1 rule pack.** Present as `@open-twin/interpreter` /
  `packages/interpreter/rules/open-twin.v0.1.yaml` (every rule
  `heuristic_no_guideline`). Custom-module priority is the intersection below —
  only those markers get Synthea Generic Modules in P7.
- **Routes.** Synthea is **Route B** (structured FHIR at build time). It must not
  pass through OCR. Route A = reference corpus; Route C = real documents + on-device OCR.

## Cannot (honest)

Blocker kinds (still status=`cannot` — not P7 module work):

| Kind | Markers | Unsupported *for OpenTwin honesty* |
|---|---|---|
| Cycle-phase coherence | BM-001, BM-119, BM-197, BM-311 | Anchor populations are phase-stratified; Generic Module Observation without a menstrual-phase attribute/physiology binding yields incoherent values for those intervals. Stock has no serum estradiol/FSH/LH; BM-311 stock path is tissue receptor IHC only, not serum `14890-8`. |
| Time-of-day coherence | BM-077 | Anchor intervals are TOD-stratified (`vor_10h` / `nach_17h`); Observation without collection-time binding fabricates incoherent values. |
| LOINC/unit undecided (D11 / D-e) | BM-060, BM-186, BM-405 | Molar LOINC + mass unit — same defect as compiler property mismatches; no honest quantity until a human picks mass vs molar. |

- **BM-001** 17-Beta-Östradiol (`14715-7`): No stock estradiol Observation; cycle-phase populations (Follikelphase etc.) require a menstrual-phase state machine Synthea does not expose — unphased random pmol/L would be physiologically incoherent for Anchor intervals
- **BM-060** Bor (`52914-9`): LOINC 52914-9 is [Moles/volume] but Anchor unit is mass (µg/l); D11 — no honest value until human decides mass vs molar code
- **BM-077** Cortisol (`2143-6`): No stock cortisol; Anchor intervals are TOD-stratified (vor_10h / nach_17h). Emitting a single Gaussian without collection-time binding fabricates incoherent values for those populations
- **BM-119** FSH (`15067-2`): No stock FSH; cycle-phase–dependent. Same phase-coherence problem as estradiol
- **BM-186** Kupfer (`14665-4`): LOINC 14665-4 is [Moles/volume] but Anchor unit is mass (µg/l); D11
- **BM-197** LH (`10501-5`): No stock LH; cycle-phase–dependent
- **BM-311** Progesteron (`14890-8`): No stock serum progesterone Observation (breast_cancer module only has tissue receptor IHC, not serum levels); serum emission without cycle-phase binding has the same honesty problem as estradiol/FSH/LH
- **BM-405** Phytonadione / Vitamin K (`58793-1`): LOINC 58793-1 is [Moles/volume] but Anchor unit is mass (ng/l); D11


## Consumer intersection (P7 scope)

Of the **36** markers needing custom modules, the v0.1 rule pack actually
consumes **22**. Only these get Synthea Generic Modules in P7; the other 14
custom markers wait until a rule references them.

| biomarker_id | name_de | LOINC |
|---|---|---|
| BM-063 | Calcium | `2000-8` |
| BM-079 | CRP (hochsensitiv) | `30522-7` |
| BM-111 | Folsäure (Vitamin B9) | `2284-8` |
| BM-114 | freies T3 (FT3) | `3051-0` |
| BM-123 | Gamma-GT (GGT) | `2324-2` |
| BM-128 | Glukose | `1558-6` |
| BM-136 | Harnsäure | `3084-1` |
| BM-190 | LDL-Cholesterin | `2089-1` |
| BM-200 | Lipoprotein (a) | `10835-7` |
| BM-258 | Magnesium | `2601-3` |
| BM-299 | Parathormon (PTH) | `2731-8` |
| BM-341 | Selen | `5724-0` |
| BM-346 | SHBG | `13967-5` |
| BM-358 | Testosteron (gesamt) | `14913-8` |
| BM-394 | Vitamin B12 | `2132-9` |
| BM-401 | Vitamin D (25-OH) | `1989-3` |
| BM-411 | Zink | `5763-8` |
| BM-431 | IgA | `2458-8` |
| BM-432 | IgG | `2465-3` |
| BM-433 | IgM | `2472-9` |
| BM-434 | CTX (Beta-Crosslaps) | `41171-0` |
| BM-435 | Desoxypyridinolin (DPD) | `25095-1` |

Pack also references stock markers (no custom module needed for LOINC presence)
and three **cannot** markers (BM-001 estradiol, BM-119 FSH, BM-197 LH) that the
rules mention but Synthea cannot honestly emit — those stay blocked on physiology,
not on module writing.

## Overlap with D-e property mismatches

BM-060 Bor, BM-186 Kupfer, and BM-405 Vitamin K are in the **cannot** set for the
same molar-LOINC / mass-unit defect recorded as D11. A marker whose LOINC property
disagrees with its unit cannot be coherently generated in Synthea either — same
defect surfacing twice (compiler D-e and Synthea honesty). They are not in the
P7 consumer list because the rule pack does not reference them.

## Coverage table

| biomarker_id | name_de | LOINC | status | evidence |
|---|---|---|---|---|
| BM-001 | 17-Beta-Östradiol | `14715-7` | cannot | No stock estradiol Observation; cycle-phase populations (Follikelphase etc.) require a menstrual-phase state machine Synthea does not expose — unphased random pmol/L would be physiologically incoherent for Anchor intervals |
| BM-014 | Anti-Müller-Hormon (AMH) | `83104-0` | custom | No stock LOINC 83104-0 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-057 | Biotin (Vitamin B7) | `1980-2` | custom | No stock LOINC 1980-2 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-060 | Bor | `52914-9` | cannot | LOINC 52914-9 is [Moles/volume] but Anchor unit is mass (µg/l); D11 — no honest value until human decides mass vs molar code |
| BM-063 | Calcium | `2000-8` | custom | stock has 17861-6 (Calcium [Mass/volume] — stock CMP uses mass not moles) in covid19/measurements_daily.json, encounter/hospital_basic_labs.json — needs custom module for Anchor LOINC 2000-8 · Same analyte, different LOINC/property; P6 connector keys Anchor codes |
| BM-064 | Calprotectin | `38445-3` | custom | No stock LOINC 38445-3 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-072 | Cholesterin (gesamt) | `2093-3` | stock | exact LOINC 2093-3 in: heart/cabg/labs_common.json, heart/cardiac_labs.json, heart/chf_lab_work.json, hiv/hiv_baseline.json (+2 more) |
| BM-077 | Cortisol | `2143-6` | cannot | No stock cortisol; Anchor intervals are TOD-stratified (vor_10h / nach_17h). Emitting a single Gaussian without collection-time binding fabricates incoherent values for those populations |
| BM-078 | Creatinkinase (CK) | `2157-6` | stock | exact LOINC 2157-6 in: covid19/measurements_frequent.json |
| BM-079 | CRP (hochsensitiv) | `30522-7` | custom | stock has 1988-5 (CRP ordinary — not high-sensitivity method) in covid19/measurements_frequent.json — needs custom module for Anchor LOINC 30522-7 · Same analyte, different LOINC/property; P6 connector keys Anchor codes |
| BM-087 | DHEA-S | `2191-5` | custom | No stock LOINC 2191-5 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-107 | Ferritin | `2276-4` | stock | exact LOINC 2276-4 in: covid19/measurements_frequent.json, heart/chf_lab_work.json |
| BM-111 | Folsäure (Vitamin B9) | `2284-8` | custom | No stock LOINC 2284-8 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-114 | freies T3 (FT3) | `3051-0` | custom | No stock LOINC 3051-0 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-115 | freies T4 (FT4) | `3024-7` | stock | exact LOINC 3024-7 in: hypothyroidism.json |
| BM-119 | FSH | `15067-2` | cannot | No stock FSH; cycle-phase–dependent. Same phase-coherence problem as estradiol |
| BM-123 | Gamma-GT (GGT) | `2324-2` | custom | No stock LOINC 2324-2 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-125 | Gesamteiweiß | `2885-2` | stock | exact LOINC 2885-2 in: colorectal_cancer.json, covid19/measurements_daily.json, dialysis.json, encounter/hospital_basic_labs.json (+9 more) |
| BM-128 | Glukose | `1558-6` | custom | stock has 2345-7 (Glucose Ser/Plas (not fasting-specific)) in covid19/measurements_daily.json, encounter/hospital_basic_labs.json; stock has 2339-0 (Glucose [Mass/volume] in Blood) in colorectal_cancer.json, congestive_heart_failure.json — needs custom module for Anchor LOINC 1558-6 · Same analyte, different LOINC/property; P6 connector keys Anchor codes |
| BM-130 | GOT (ASAT) | `1920-8` | stock | exact LOINC 1920-8 in: colorectal_cancer.json, covid19/measurements_daily.json, dialysis.json, encounter/hospital_basic_labs.json (+9 more) |
| BM-132 | GPT (ALAT) | `1742-6` | stock | exact LOINC 1742-6 in: colorectal_cancer.json, covid19/measurements_daily.json, dialysis.json, encounter/hospital_basic_labs.json (+9 more) |
| BM-136 | Harnsäure | `3084-1` | custom | No stock LOINC 3084-1 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-139 | HbA1c | `4548-4` | stock | exact LOINC 4548-4 in: heart/cabg/preoperative.json, heart/cardiac_labs.json, heart/chf_lab_work.json, metabolic_syndrome_care.json |
| BM-140 | HDL-Cholesterin | `2085-9` | stock | exact LOINC 2085-9 in: heart/cabg/labs_common.json, heart/cardiac_labs.json, heart/chf_lab_work.json, hiv/hiv_baseline.json (+2 more) |
| BM-154 | Holotranscobalamin (aktives B12) | `72160-5` | custom | No stock LOINC 72160-5 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-156 | Homocystein | `13965-9` | custom | No stock LOINC 13965-9 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-176 | Jod | `2494-3` | custom | No stock LOINC 2494-3 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-177 | Kalium | `2823-3` | stock | exact LOINC 2823-3 in: covid19/measurements_daily.json, encounter/hospital_basic_labs.json, gallstones.json, heart/cabg/labs_common.json (+5 more) |
| BM-186 | Kupfer | `14665-4` | cannot | LOINC 14665-4 is [Moles/volume] but Anchor unit is mass (µg/l); D11 |
| BM-190 | LDL-Cholesterin | `2089-1` | custom | stock has 18262-6 (LDL by Direct assay — not 2089-1) in heart/cabg/labs_common.json, heart/cardiac_labs.json — needs custom module for Anchor LOINC 2089-1 · Same analyte, different LOINC/property; P6 connector keys Anchor codes |
| BM-197 | LH | `10501-5` | cannot | No stock LH; cycle-phase–dependent |
| BM-200 | Lipoprotein (a) | `10835-7` | custom | No stock LOINC 10835-7 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-258 | Magnesium | `2601-3` | custom | stock has 19123-9 (Magnesium [Mass/volume] Ser/Plas) in encounter/hospital_basic_labs.json, heart/cabg/labs_common.json; stock has 21377-7 (Magnesium [Mass/volume] in Blood) in heart/cardiac_labs.json — needs custom module for Anchor LOINC 2601-3 · Same analyte, different LOINC/property; P6 connector keys Anchor codes |
| BM-286 | Natrium | `2951-2` | stock | exact LOINC 2951-2 in: covid19/measurements_daily.json, encounter/hospital_basic_labs.json, gallstones.json, heart/cabg/labs_common.json (+5 more) |
| BM-299 | Parathormon (PTH) | `2731-8` | custom | No stock LOINC 2731-8 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-311 | Progesteron | `14890-8` | cannot | No stock serum progesterone Observation (breast_cancer module only has tissue receptor IHC, not serum levels); serum emission without cycle-phase binding has the same honesty problem as estradiol/FSH/LH |
| BM-312 | Prolaktin | `2842-3` | custom | No stock LOINC 2842-3 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-315 | PSA | `2857-1` | stock | exact LOINC 2857-1 in: veteran_prostate_cancer.json |
| BM-341 | Selen | `5724-0` | custom | No stock LOINC 5724-0 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-346 | SHBG | `13967-5` | custom | No stock LOINC 13967-5 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-358 | Testosteron (gesamt) | `14913-8` | custom | No stock LOINC 14913-8 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-383 | Triglyceride | `2571-8` | stock | exact LOINC 2571-8 in: heart/cabg/labs_common.json, heart/cardiac_labs.json, heart/chf_lab_work.json, hiv/hiv_baseline.json (+2 more) |
| BM-386 | TSH | `3016-3` | stock | exact LOINC 3016-3 in: heart/cabg/preoperative.json, hypothyroidism.json |
| BM-392 | Vitamin A | `2923-1` | custom | No stock LOINC 2923-1 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-393 | Vitamin B1 (Thiamin) | `2998-3` | custom | No stock LOINC 2998-3 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-394 | Vitamin B12 | `2132-9` | custom | No stock LOINC 2132-9 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-395 | Vitamin B2 (Riboflavin) | `2924-9` | custom | No stock LOINC 2924-9 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-397 | Vitamin B5 (Pantothensäure) | `2722-7` | custom | No stock LOINC 2722-7 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-398 | Vitamin B6 | `30552-4` | custom | No stock LOINC 30552-4 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-401 | Vitamin D (25-OH) | `1989-3` | custom | No stock LOINC 1989-3 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-404 | Vitamin E | `1823-4` | custom | No stock LOINC 1823-4 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-405 | Phytonadione / Vitamin K | `58793-1` | cannot | LOINC 58793-1 is [Moles/volume] but Anchor unit is mass (ng/l); D11 |
| BM-411 | Zink | `5763-8` | custom | No stock LOINC 5763-8 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-423 | Hämoglobin | `718-7` | stock | exact LOINC 718-7 in: anemia/anemia_sub.json, bone_marrow_transplant.json, colorectal_cancer.json, covid19/measurements_daily.json (+11 more) |
| BM-424 | Hämatokrit | `4544-3` | stock | exact LOINC 4544-3 in: bone_marrow_transplant.json, colorectal_cancer.json, covid19/measurements_daily.json, encounter/hospital_basic_labs.json (+9 more) · Exact 4544-3 in hospital CBC; anemia/anemia_sub.json often emits 20570-8 (Hct by calculation) instead |
| BM-425 | Erythrozyten | `789-8` | stock | exact LOINC 789-8 in: anemia/anemia_sub.json, bone_marrow_transplant.json, colorectal_cancer.json, covid19/measurements_daily.json (+10 more) |
| BM-426 | Leukozyten | `6690-2` | stock | exact LOINC 6690-2 in: anemia/anemia_sub.json, bone_marrow_transplant.json, colorectal_cancer.json, covid19/measurements_daily.json (+10 more) |
| BM-427 | Thrombozyten | `777-3` | stock | exact LOINC 777-3 in: anemia/anemia_sub.json, bone_marrow_transplant.json, colorectal_cancer.json, covid19/measurements_daily.json (+10 more) |
| BM-428 | MCV | `787-2` | stock | exact LOINC 787-2 in: anemia/anemia_sub.json, bone_marrow_transplant.json, colorectal_cancer.json, covid19/measurements_daily.json (+10 more) · Stock CBC draws MCV from an independent range (hospital_basic_labs.json), not from Hb/Hct/RBC — coherence must be imposed by a custom layer or rejected |
| BM-429 | MCH | `785-6` | stock | exact LOINC 785-6 in: anemia/anemia_sub.json, bone_marrow_transplant.json, colorectal_cancer.json, covid19/measurements_daily.json (+10 more) · Stock CBC draws MCH from an independent range (hospital_basic_labs.json), not from Hb/Hct/RBC — coherence must be imposed by a custom layer or rejected |
| BM-430 | MCHC | `786-4` | stock | exact LOINC 786-4 in: anemia/anemia_sub.json, bone_marrow_transplant.json, colorectal_cancer.json, covid19/measurements_daily.json (+10 more) · Stock CBC draws MCHC from an independent range (hospital_basic_labs.json), not from Hb/Hct/RBC — coherence must be imposed by a custom layer or rejected |
| BM-431 | IgA | `2458-8` | custom | No stock LOINC 2458-8 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-432 | IgG | `2465-3` | custom | No stock LOINC 2465-3 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-433 | IgM | `2472-9` | custom | No stock LOINC 2472-9 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-434 | CTX (Beta-Crosslaps) | `41171-0` | custom | No stock LOINC 41171-0 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-435 | Desoxypyridinolin (DPD) | `25095-1` | custom | No stock LOINC 25095-1 in Synthea modules (scanned system LOINC\|http://loinc.org across 242 module files) · Expressible as Generic Module numeric Observation; no stock physiology model |
| BM-436 | Kreatinin | `2160-0` | stock | exact LOINC 2160-0 in: covid19/measurements_daily.json, encounter/hospital_basic_labs.json, gallstones.json, heart/cabg/labs_common.json (+5 more) |

## Stock modules cited most often

| Module | Anchor LOINCs (examples) |
|---|---|
| `encounter/hospital_basic_labs.json` | CBC panel, CMP (Na/K/crea/protein/ALT/AST), Mg sibling |
| `heart/cardiac_labs.json` / `heart/chf_lab_work.json` / `heart/cabg/labs_common.json` | lipids, HbA1c, ferritin, CBC, CMP |
| `hypothyroidism.json` | TSH `3016-3`, FT4 `3024-7` |
| `metabolic_syndrome_care.json` | HbA1c `4548-4` |
| `veteran_prostate_cancer.json` | PSA `2857-1` |
| `covid19/measurements_*.json` | CBC, CMP subset, CK, ferritin, CRP sibling |
| `anemia/anemia_sub.json` | CBC (Hct often `20570-8` not Anchor `4544-3`) |

## Stop line

This file is the deliverable for task §1. **No Synthea modules have been written.**
Await review before §2 (custom modules for the gap).

