# Parked for branch 24 — fhir-core Anchor / lab UCUM body content

**Status.** Explicit input to branch `24-fhir-connector` (or whichever branch lands
provider-anchor / Anchor `SYSTEMS` + lab UCUM in `@open-twin/fhir-core`).

**Why this file exists.** On `20b-module-headers`, `packages/fhir-core/src/systems.ts`
and `packages/fhir-core/src/units.ts` were Method-B *upstream-untouched*, so a
wholesale snapshot checkout looked safe. Snapshot bodies also carried **P6 content
beyond the header**: Anchor code-system / identifier URIs and lab UCUM table
entries (including known ugly UCUM display names from the library). That content
does **not** belong on a headers branch, so bodies were restored to `main`.

Without this park, that content exists nowhere in the reconstruction stack and
branch 24 will either fail to build or silently lose lab units — with the cause
four branches upstream.

**Apply on 24:** take `main` (or tip) bodies of the two files, apply the hunks
below (or re-checkout these two paths from `wip/snapshot-2026-08-02` and keep
headers pointing at `DECISIONS.md#d3` / `#d4`), then run fhir-core + consumer tests.

**Source tip:** `wip/snapshot-2026-08-02` (`9430068`).

```diff
--- a/packages/fhir-core/src/systems.ts (main body)
+++ b/packages/fhir-core/src/systems.ts (snapshot body — park for branch 24)
@@ -12,6 +12,7 @@
   OURA: 'http://opentwin.ch/fhir/CodeSystem/oura',
   GOOGLE_HEALTH: 'http://opentwin.ch/fhir/CodeSystem/google-health',
   VITRONIC: 'http://opentwin.ch/fhir/CodeSystem/vitronic',
+  ANCHOR: 'http://opentwin.ch/fhir/CodeSystem/anchor',
 
   /**
    * How a value was arrived at — measured, device-estimated, derived from sleep, or
@@ -23,7 +24,8 @@
   /** Foundation-controlled identifier namespaces, reused as `Identifier.system` (D2). */
   OURA_IDENTIFIER: 'http://opentwin.ch/fhir/sid/oura',
   GOOGLE_HEALTH_IDENTIFIER: 'http://opentwin.ch/fhir/sid/google-health',
-  VITRONIC_IDENTIFIER: 'http://opentwin.ch/fhir/sid/vitronic'
+  VITRONIC_IDENTIFIER: 'http://opentwin.ch/fhir/sid/vitronic',
+  ANCHOR_IDENTIFIER: 'http://opentwin.ch/fhir/sid/anchor'
 } as const;
 
 /**

--- a/packages/fhir-core/src/units.ts (main body)
+++ b/packages/fhir-core/src/units.ts (snapshot body — park for branch 24)
@@ -87,6 +87,16 @@
   MG_PER_DL: { unit: 'milligram per deciliter', code: 'mg/dL' },
   MICROGRAM_PER_LITRE: { unit: 'microgram per liter', code: 'ug/L' },
   MMOL_PER_L: { unit: 'millimole per liter', code: 'mmol/L' },
+  // Anchor laboratory units. `unit` strings are UCUM's own published names
+  // (including the library's "millliiter" spelling for ng/mL) — check-units.mjs
+  // requires Quantity.unit === UCUM name for Quantity.code.
+  NG_PER_ML: { unit: 'nanogram per millliiter', code: 'ng/mL' },
+  PMOL_PER_L: { unit: 'picomole per liter', code: 'pmol/L' },
+  ENZYME_UNIT_PER_L: { unit: 'enzyme unit per liter', code: 'U/L' },
+  TEN_9_PER_L: { unit: 'billion per liter', code: '10*9/L' },
+  UG_PER_G: { unit: 'microgram per gram', code: 'ug/g' },
+  NMOL_PER_MMOL: { unit: 'nanomole per millimole', code: 'nmol/mmol' },
+  MIU_PER_L: { unit: 'milli international unit per liter', code: 'm[IU]/L' },
 
   // energy
   KILOCALORIE: { unit: 'kilocalorie', code: 'kcal' },
@@ -175,9 +185,16 @@
   '2339-0': UCUM.MG_PER_DL,
   '15074-8': UCUM.MMOL_PER_L,
 
-  // Anchor layer.
-  '4548-4': UCUM.PERCENT, // Hemoglobin A1c/Hemoglobin.total in Blood
-  '2276-4': UCUM.MICROGRAM_PER_LITRE // Ferritin [Mass/volume] in Serum or Plasma
+  // Anchor laboratory biomarkers (provider-anchor). One unit per LOINC (D4).
+  '2276-4': UCUM.NG_PER_ML, // Ferritin [Mass/volume] — Anchor unit_ucum ng/mL
+  '2000-8': UCUM.MMOL_PER_L, // Calcium [Moles/volume]
+  '1742-6': UCUM.ENZYME_UNIT_PER_L, // Alanine aminotransferase [Enzymatic activity/volume]
+  '4548-4': UCUM.PERCENT, // Hemoglobin A1c/Hemoglobin.total in Blood (mass fraction as %)
+  '6690-2': UCUM.TEN_9_PER_L, // Leukocytes [#/volume]
+  '38445-3': UCUM.UG_PER_G, // Calprotectin [Mass/mass] in Stool
+  '25095-1': UCUM.NMOL_PER_MMOL, // Deoxypyridinoline/Creatinine [Molar ratio]
+  '14715-7': UCUM.PMOL_PER_L, // Estradiol [Moles/volume]
+  '3016-3': UCUM.MIU_PER_L // Thyrotropin [Units/volume]
 };
 
 /**

```
