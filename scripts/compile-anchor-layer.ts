/**
 * WHAT: Compiles the consolidated Anchor workbook into a versioned, checksummed JSON artefact.
 * NOT:  Does not invent LOINC/UCUM codes, auto-fix property mismatches, or attach (low,high) to biomarkers.
 * GOVERNED BY: docs/contracts/anchor-organ-to-system.md; SAD §7 / D-a–D-e
 * CORRECTNESS: sha256 of deterministic JSON; UCUM grammar via @lhncbc/ucum-lhc; property-mismatch detection against LOINC FSN text
 * GOTCHA: Exit code 1 when the three known molar/mass mismatches are present — that failure is the deliverable, not a surprise.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const require = createRequire(import.meta.url);
// CJS package; named ESM import is unreliable under tsx
const { UcumLhcUtils } = require('@lhncbc/ucum-lhc') as {
  UcumLhcUtils: {
    getInstance: () => {
      validateUnitString: (code: string, sync?: boolean) => { status: string | number; msg?: string | string[] };
    };
  };
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SOURCE = join(ROOT, 'docs/evidence/source/2026_07_28_OpenTwin_AnchorLayer_v3_Consolidated.xlsx');
const OUT_DIR = join(ROOT, 'packages/anchor-layer/data');
const OUT_JSON = join(OUT_DIR, 'anchor-layer.v1.json');
const OUT_SHA = join(OUT_DIR, 'anchor-layer.v1.json.sha256');
const AUDIT = join(ROOT, 'docs/findings/anchor-layer-audit.md');

type SystemId =
  | 'cardiovascular'
  | 'respiratory'
  | 'nervous'
  | 'digestive'
  | 'musculoskeletal'
  | 'endocrine'
  | 'reproductive'
  | 'metabolic'
  | 'integumentary';

const REGION_TO_SYSTEM: Record<string, SystemId> = {
  liver: 'digestive',
  biliary: 'digestive',
  gut: 'digestive',
  heart: 'cardiovascular',
  vasculature: 'cardiovascular',
  lipid_transport: 'cardiovascular',
  brain: 'nervous',
  sleep_recovery: 'nervous',
  bone: 'musculoskeletal',
  skeletal_muscle: 'musculoskeletal',
  body_composition: 'musculoskeletal',
  thyroid: 'endocrine',
  parathyroid: 'endocrine',
  pituitary: 'endocrine',
  adrenal: 'endocrine',
  pancreas_endocrine: 'endocrine',
  gonads: 'reproductive',
  prostate: 'reproductive',
  kidney: 'metabolic',
  micronutrient_status: 'metabolic',
  electrolyte_balance: 'metabolic',
  metabolic_glycemic: 'metabolic',
  systemic_inflammation: 'metabolic',
  immune: 'metabolic',
  bone_marrow_blood: 'metabolic'
};

const EXPECTED_MISMATCH_IDS = new Set(['BM-060', 'BM-186', 'BM-405']);

interface BiomarkerRow {
  biomarker_id: string;
  name_de: string;
  loinc_code: string;
  loinc_display: string;
  tier: string;
  unit_source: string;
  unit_ucum: string;
  system_id: SystemId;
  interpretive_anatomy_source: 'curated_table';
  region_ids: string[];
  organ_mapping_source: string;
  blocking_flags: string;
  provenance: {
    source_file: string;
    sha256: string;
    sheet: string;
    row: number;
  };
}

interface ReferenceIntervalRecord {
  interval_id: string;
  biomarker_id: string;
  issuer: string | null;
  issuer_kind: string | null;
  assay: string | null;
  source_url: string | null;
  retrieved_at: string | null;
  population: string | null;
  low: number | null;
  high: number | null;
  unit_ucum: string | null;
  unit_source: string | null;
  record_kind: 'reference_interval';
  reference_range_text: string | null;
  provenance: {
    source_file: string;
    sha256: string;
    sheet: string;
    row: number;
  };
}

interface InterpretiveBandRecord {
  interval_id: string;
  biomarker_id: string;
  issuer: string | null;
  issuer_kind: string | null;
  assay: string | null;
  source_url: string | null;
  retrieved_at: string | null;
  population: string | null;
  low: number | null;
  high: number | null;
  unit_ucum: string | null;
  unit_source: string | null;
  record_kind: 'interpretive_band';
  reference_range_text: string | null;
  provenance: {
    source_file: string;
    sha256: string;
    sheet: string;
    row: number;
  };
}

function sheetRows(ws: ExcelJS.Worksheet): { rowNumber: number; data: Record<string, unknown> }[] {
  const headers: string[] = [];
  const out: { rowNumber: number; data: Record<string, unknown> }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        headers[col] = cell.value == null ? '' : String(cell.value);
      });
      return;
    }
    const data: Record<string, unknown> = {};
    let any = false;
    for (let col = 1; col < headers.length; col++) {
      const key = headers[col];
      if (!key) continue;
      const cell = row.getCell(col);
      let v: unknown = cell.value;
      if (v && typeof v === 'object' && 'result' in (v as object)) {
        v = (v as { result: unknown }).result;
      }
      if (v && typeof v === 'object' && 'text' in (v as object)) {
        v = (v as { text: unknown }).text;
      }
      if (v != null && v !== '') any = true;
      data[key] = v ?? null;
    }
    if (any) out.push({ rowNumber, data });
  });
  return out;
}

function systemIdForRegions(regionIds: string): SystemId {
  const primary = regionIds.split('|')[0]?.trim() ?? '';
  const sid = REGION_TO_SYSTEM[primary];
  if (!sid) {
    throw new Error(`No SystemId mapping for region_id "${primary}"`);
  }
  return sid;
}

function loincProperty(loincName: string): 'moles' | 'mass' | 'other' {
  if (/\[Moles\/volume\]/i.test(loincName)) return 'moles';
  if (/\[Mass\/volume\]/i.test(loincName)) return 'mass';
  return 'other';
}

function unitLooksMass(unit: string): boolean {
  const u = unit.toLowerCase().replace('µ', 'u').replace('μ', 'u');
  return /^(ug|ng|mg|g|pg)(\/|$)/i.test(u) || (/\/(l|ml|dl)$/i.test(u) && /^(ug|ng|mg|g|pg)/i.test(u));
}

function unitLooksMolar(unit: string): boolean {
  const u = unit.toLowerCase().replace('µ', 'u').replace('μ', 'u');
  return /(mol|mmol|umol|nmol|pmol)/i.test(u);
}

function validateUcum(code: string): { ok: boolean; message: string } {
  if (!code) return { ok: false, message: 'empty unit_ucum' };
  const utils = UcumLhcUtils.getInstance();
  const result = utils.validateUnitString(code, true);
  const ok = result.status === 'valid' || result.status === 0;
  const msg = Array.isArray(result.msg) ? result.msg.join('; ') : String(result.msg ?? '');
  return { ok, message: msg };
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main(): Promise<void> {
  const sourceBytes = readFileSync(SOURCE);
  const sourceSha = createHash('sha256').update(sourceBytes).digest('hex');
  const sourceFile = 'docs/evidence/source/2026_07_28_OpenTwin_AnchorLayer_v3_Consolidated.xlsx';

  const wb = new ExcelJS.Workbook();
  // exceljs Buffer typing for load() is incomplete across versions
  // biome-ignore lint/suspicious/noExplicitAny: exceljs xlsx.load Buffer overload
  await (wb.xlsx as any).load(sourceBytes);

  const readmeWs = wb.getWorksheet('README');
  const coreWs = wb.getWorksheet('Anchor_Core_Set');
  const riWs = wb.getWorksheet('Reference_Intervals');
  const loincWs = wb.getWorksheet('LOINC_Map');
  const organWs = wb.getWorksheet('Organ_Mapping_Crosswalk');
  if (!readmeWs || !coreWs || !riWs || !loincWs || !organWs) {
    throw new Error(
      'Missing required sheet (README, Anchor_Core_Set, Reference_Intervals, LOINC_Map, Organ_Mapping_Crosswalk)'
    );
  }

  // README is authority for headline numbers; we recompute and compare in the audit.
  void readmeWs;
  void organWs; // region_ids on core already apply the crosswalk; SystemId via curated contract

  const coreRows = sheetRows(coreWs);
  const riRows = sheetRows(riWs);
  const loincById = new Map<string, { loinc_code: string; loinc_name: string }>();
  for (const { data: r } of sheetRows(loincWs)) {
    const id = String(r.biomarker_id ?? '');
    if (!id) continue;
    if (Number(r.in_core_set) !== 1 && String(r.in_core_set) !== '1') continue;
    loincById.set(id, {
      loinc_code: String(r.loinc_code ?? ''),
      loinc_name: String(r.loinc_name ?? '')
    });
  }

  const biomarkers: BiomarkerRow[] = [];
  const propertyMismatches: {
    biomarker_id: string;
    name_de: string;
    loinc_code: string;
    loinc_name: string;
    unit_source: string;
    unit_ucum: string;
  }[] = [];
  const ucumFailures: { biomarker_id: string; unit_ucum: string; message: string }[] = [];
  const ucumDisagreements: {
    biomarker_id: string;
    unit_source: string;
    unit_ucum: string;
    note: string;
  }[] = [];

  for (const { rowNumber, data: r } of coreRows) {
    const biomarker_id = String(r.biomarker_id ?? '');
    if (!biomarker_id) continue;
    const name_de = String(r.name_de ?? '');
    const loinc_code = String(r.loinc_code ?? '');
    const loinc_display = String(r.loinc_name ?? '');
    const mapped = loincById.get(biomarker_id);
    if (!mapped) {
      throw new Error(`LOINC_Map missing core marker ${biomarker_id}`);
    }
    if (mapped.loinc_code !== loinc_code || mapped.loinc_name !== loinc_display) {
      throw new Error(
        `LOINC_Map disagrees with Anchor_Core_Set for ${biomarker_id}: core ${loinc_code}/${loinc_display} vs map ${mapped.loinc_code}/${mapped.loinc_name}`
      );
    }
    const tier = String(r.tier ?? '');
    const unit_source = String(r.unit_source ?? '');
    const unit_ucum = String(r.unit_ucum ?? '');
    const region_ids_raw = String(r.region_ids ?? '');
    const organ_mapping_source = String(r.organ_mapping_source ?? '');
    const blocking_flags = String(r.blocking_flags ?? '');

    // D-d: capital G/l and T/l are blood-count multipliers, not gauss/tesla.
    // Lowercase g/l is grams/litre (protein, Igs) — do not treat as Giga.
    if (unit_source === 'G/l' && unit_ucum !== '10*9/L') {
      ucumDisagreements.push({
        biomarker_id,
        unit_source,
        unit_ucum,
        note: 'German G/l means 10^9/L; expected unit_ucum 10*9/L'
      });
    }
    if (unit_source === 'T/l' && unit_ucum !== '10*12/L') {
      ucumDisagreements.push({
        biomarker_id,
        unit_source,
        unit_ucum,
        note: 'German T/l means 10^12/L; expected unit_ucum 10*12/L'
      });
    }

    const v = validateUcum(unit_ucum);
    if (!v.ok) {
      ucumFailures.push({ biomarker_id, unit_ucum, message: v.message });
    }

    // D-e: molar LOINC + mass unit
    const prop = loincProperty(loinc_display);
    if (prop === 'moles' && unitLooksMass(unit_source) && !unitLooksMolar(unit_source)) {
      propertyMismatches.push({
        biomarker_id,
        name_de,
        loinc_code,
        loinc_name: loinc_display,
        unit_source,
        unit_ucum
      });
    }

    biomarkers.push({
      biomarker_id,
      name_de,
      loinc_code,
      loinc_display,
      tier,
      unit_source,
      unit_ucum,
      system_id: systemIdForRegions(region_ids_raw),
      interpretive_anatomy_source: 'curated_table',
      region_ids: region_ids_raw
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean),
      organ_mapping_source,
      blocking_flags,
      provenance: {
        source_file: sourceFile,
        sha256: sourceSha,
        sheet: 'Anchor_Core_Set',
        row: rowNumber
      }
    });
  }

  const reference_intervals: ReferenceIntervalRecord[] = [];
  const interpretive_bands: InterpretiveBandRecord[] = [];
  for (const { rowNumber, data: r } of riRows) {
    const interval_id = r.interval_id == null ? '' : String(r.interval_id);
    if (!interval_id) continue;
    const record_kind = r.record_kind == null ? '' : String(r.record_kind);
    if (!record_kind) continue;

    const base = {
      interval_id,
      biomarker_id: String(r.biomarker_id ?? ''),
      issuer: r.issuer == null ? null : String(r.issuer),
      issuer_kind: r.issuer_kind == null ? null : String(r.issuer_kind),
      assay: r.assay_or_catalogue == null ? null : String(r.assay_or_catalogue),
      source_url: r.source_url == null ? null : String(r.source_url),
      retrieved_at: r.retrieved_at == null ? null : String(r.retrieved_at),
      population: r.population == null ? null : String(r.population),
      low: r.low == null || r.low === '' ? null : Number(r.low),
      high: r.high == null || r.high === '' ? null : Number(r.high),
      unit_ucum: r.unit_ucum == null ? null : String(r.unit_ucum),
      unit_source: r.unit == null ? null : String(r.unit),
      reference_range_text: r.reference_range_text == null ? null : String(r.reference_range_text),
      provenance: {
        source_file: sourceFile,
        sha256: sourceSha,
        sheet: 'Reference_Intervals',
        row: rowNumber
      }
    };

    if (record_kind === 'reference_interval') {
      reference_intervals.push({ ...base, record_kind: 'reference_interval' });
    } else if (record_kind.includes('INTERPRETIVE_BAND')) {
      interpretive_bands.push({ ...base, record_kind: 'interpretive_band' });
    }
  }

  const coreIds = new Set(biomarkers.map((b) => b.biomarker_id));
  const withReferenceInterval = new Set<string>();
  for (const ri of reference_intervals) {
    if (coreIds.has(ri.biomarker_id)) withReferenceInterval.add(ri.biomarker_id);
  }
  const withBand = new Set<string>();
  for (const b of interpretive_bands) {
    if (coreIds.has(b.biomarker_id)) withBand.add(b.biomarker_id);
  }
  const markersWithReferenceInterval = [...withReferenceInterval].sort();
  const markersWithInterpretiveBandOnly = [...withBand].filter((id) => !withReferenceInterval.has(id)).sort();
  const markersWithNeither = [...coreIds].filter((id) => !withReferenceInterval.has(id) && !withBand.has(id)).sort();

  const byTier: Record<string, number> = {};
  for (const b of biomarkers) {
    byTier[b.tier] = (byTier[b.tier] ?? 0) + 1;
  }

  const counts = {
    markers_with_reference_interval: markersWithReferenceInterval.length,
    markers_with_interpretive_band_only: markersWithInterpretiveBandOnly.length,
    markers_with_neither: markersWithNeither.length
  };

  const artefact = {
    schema_version: 'anchor-layer.v1',
    compiled_at_source_sha256: sourceSha,
    source_file: sourceFile,
    decisions: ['D-a', 'D-b', 'D-c', 'D-d', 'D-e'],
    biomarkers: biomarkers.sort((a, b) => a.biomarker_id.localeCompare(b.biomarker_id)),
    reference_intervals: reference_intervals.sort((a, b) => a.interval_id.localeCompare(b.interval_id)),
    interpretive_bands: interpretive_bands.sort((a, b) => a.interval_id.localeCompare(b.interval_id)),
    counts
  };

  const jsonText = stableStringify(artefact);
  const jsonSha = createHash('sha256').update(jsonText).digest('hex');

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_JSON, jsonText, 'utf8');
  writeFileSync(OUT_SHA, `${jsonSha}  anchor-layer.v1.json\n`, 'utf8');

  const mismatchIds = new Set(propertyMismatches.map((m) => m.biomarker_id));
  const expectedHit = [...EXPECTED_MISMATCH_IDS].every((id) => mismatchIds.has(id));
  const unexpected = propertyMismatches.filter((m) => !EXPECTED_MISMATCH_IDS.has(m.biomarker_id));

  const bandOnlyLines = markersWithInterpretiveBandOnly.map((id) => {
    const b = biomarkers.find((x) => x.biomarker_id === id);
    if (!b) throw new Error(`missing biomarker for band-only id ${id}`);
    return `- **${id} ${b.name_de}** — interpretive bands only (no \`reference_interval\`). Bands are already an interpretation (optimal / gut / grenzwertig / erhöht / pathologisch); they must not stand in for a measured interval (D-a, D-c).`;
  });

  const audit = `# Anchor layer audit

Source: \`${sourceFile}\`  
Source sha256: \`${sourceSha}\`  
Artefact: \`packages/anchor-layer/data/anchor-layer.v1.json\`  
Artefact sha256: \`${jsonSha}\`

## Counts (D-c — do not merge)

Reference intervals and interpretive bands are different kinds. A prior workbook README
headline ("31 markers with an interval") **conflated** them; that source number was
wrong for abstention purposes and is corrected here rather than quietly reused.

| Metric | Value | Notes |
|---|---:|---|
| Biomarkers | ${biomarkers.length} | expected 67 |
| Reference intervals (\`record_kind=reference_interval\`) | ${reference_intervals.length} | expected 93 |
| Interpretive bands (\`record_kind=interpretive_band\`) | ${interpretive_bands.length} | expected 5 |
| \`counts.markers_with_reference_interval\` | ${counts.markers_with_reference_interval} | measured assay intervals only |
| \`counts.markers_with_interpretive_band_only\` | ${counts.markers_with_interpretive_band_only} | band(s), no reference interval |
| \`counts.markers_with_neither\` | ${counts.markers_with_neither} | abstain — no measured interval |
| Property mismatches (molar LOINC + mass unit) | ${propertyMismatches.length} | expected 3 |

Superseded conflated headline (do not use): "31 with interval / 36 without" mixed RI∨band.

### By tier

${Object.entries(byTier)
  .map(([t, n]) => `- \`${t}\`: ${n}`)
  .join('\n')}

## Markers with interpretive band only (not a reference interval)

${bandOnlyLines.join('\n') || '_none_'}

## Markers with neither reference interval nor band (abstain)

${markersWithNeither
  .map((id) => {
    const b = biomarkers.find((x) => x.biomarker_id === id);
    if (!b) throw new Error(`missing biomarker for neither-interval id ${id}`);
    return `- ${id} ${b.name_de}`;
  })
  .join('\n')}

## Property mismatches (D-e) — compiler FAIL condition

${
  propertyMismatches
    .map(
      (m) =>
        `- **${m.biomarker_id}** ${m.name_de}: LOINC \`${m.loinc_code}\` (${m.loinc_name}) with unit \`${m.unit_source}\` / UCUM \`${m.unit_ucum}\``
    )
    .join('\n') || '_none_'
}

Expected IDs detected: ${expectedHit ? 'yes (BM-060, BM-186, BM-405)' : 'NO — investigate'}  
Unexpected mismatches: ${unexpected.length}

## UCUM validation

Failures (grammar library rejected \`unit_ucum\`):

${ucumFailures.map((u) => `- ${u.biomarker_id}: \`${u.unit_ucum}\` — ${u.message}`).join('\n') || '_none_'}

Disagreements with German blood-count notation (D-d):

${ucumDisagreements.map((u) => `- ${u.biomarker_id}: ${u.note} (source \`${u.unit_source}\`, column \`${u.unit_ucum}\`)`).join('\n') || '_none_'}

## Notes

- Biomarker records do **not** carry \`(low, high)\` (D-b).
- Interpretive bands are a separate array from reference intervals (D-c).
- \`system_id\` comes from \`docs/contracts/anchor-organ-to-system.md\` (curated_table).
`;

  mkdirSync(dirname(AUDIT), { recursive: true });
  writeFileSync(AUDIT, audit, 'utf8');

  console.log(`Wrote ${OUT_JSON}`);
  console.log(`sha256 ${jsonSha}`);
  console.log(`Audit ${AUDIT}`);
  console.log(
    `counts: biomarkers=${biomarkers.length} ref_intervals=${reference_intervals.length} bands=${interpretive_bands.length} with_ri=${counts.markers_with_reference_interval} band_only=${counts.markers_with_interpretive_band_only} neither=${counts.markers_with_neither} mismatches=${propertyMismatches.length}`
  );

  if (biomarkers.length !== 67) {
    console.error(`FAIL: expected 67 biomarkers, got ${biomarkers.length}`);
    process.exit(1);
  }
  if (!expectedHit || propertyMismatches.length !== 3 || unexpected.length) {
    console.error('FAIL: property mismatches (D-e) — human ADR required, not auto-fixed:');
    for (const m of propertyMismatches) {
      console.error(`  ${m.biomarker_id} ${m.name_de} LOINC ${m.loinc_code} unit ${m.unit_source}`);
    }
    process.exit(1);
  }

  // Still fail on the three known mismatches so CI cannot green-wash them
  console.error('FAIL: property mismatch (D-e) — three LOINC molar/mass conflicts require an ADR:');
  for (const id of ['BM-060', 'BM-186', 'BM-405']) {
    const m = propertyMismatches.find((x) => x.biomarker_id === id);
    if (!m) throw new Error(`expected property mismatch missing for ${id}`);
    console.error(
      `  ${m.biomarker_id} ${m.name_de} LOINC ${m.loinc_code} unit ${m.unit_source} — property mismatch (molar LOINC + mass unit)`
    );
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
