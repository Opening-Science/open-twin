/**
 * WHAT: Loads the compiled Anchor-layer artefact and exposes mismatch detection helpers.
 * NOT:  Does not compile the workbook (see scripts/compile-anchor-layer.ts); does not invent LOINC/UCUM.
 * GOVERNED BY: docs/contracts/anchor-organ-to-system.md; DECISIONS.md#d11; D-a–D-e
 * CORRECTNESS: Round-trip of packages/anchor-layer/data/anchor-layer.v1.json; sha256 sidecar; D-e mismatch set
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ARTEFACT_PATH = join(HERE, '../data/anchor-layer.v1.json');
export const ARTEFACT_SHA256_PATH = join(HERE, '../data/anchor-layer.v1.json.sha256');

export type SystemId =
  | 'cardiovascular'
  | 'respiratory'
  | 'nervous'
  | 'digestive'
  | 'musculoskeletal'
  | 'endocrine'
  | 'reproductive'
  | 'metabolic'
  | 'integumentary';

export interface Provenance {
  source_file: string;
  sha256: string;
  sheet: string;
  row: number;
}

export interface Biomarker {
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
  provenance: Provenance;
}

export interface ReferenceInterval {
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
  provenance: Provenance;
}

export interface InterpretiveBand {
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
  provenance: Provenance;
}

/** D-c: never merge reference intervals with interpretive bands into one “has interval” count. */
export interface AnchorLayerCounts {
  markers_with_reference_interval: number;
  markers_with_interpretive_band_only: number;
  markers_with_neither: number;
}

export interface AnchorLayerV1 {
  schema_version: 'anchor-layer.v1';
  compiled_at_source_sha256: string;
  source_file: string;
  decisions: string[];
  biomarkers: Biomarker[];
  reference_intervals: ReferenceInterval[];
  interpretive_bands: InterpretiveBand[];
  counts: AnchorLayerCounts;
}

/** The three markers D-e requires the compiler to detect and refuse to auto-fix. */
export const PROPERTY_MISMATCH_IDS = ['BM-060', 'BM-186', 'BM-405'] as const;

export function loadAnchorLayer(path: string = ARTEFACT_PATH): AnchorLayerV1 {
  const text = readFileSync(path, 'utf8');
  return JSON.parse(text) as AnchorLayerV1;
}

export function sha256OfFile(path: string = ARTEFACT_PATH): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function readSidecarSha256(path: string = ARTEFACT_SHA256_PATH): string {
  const line = readFileSync(path, 'utf8').trim();
  return line.split(/\s+/)[0] ?? '';
}

/** LOINC FSN property axis used by D-e. Shared with scripts/compile-anchor-layer.ts. */
export function loincProperty(loincDisplay: string): 'moles' | 'mass' | 'other' {
  if (/\[Moles\/volume\]/i.test(loincDisplay)) return 'moles';
  if (/\[Mass\/volume\]/i.test(loincDisplay)) return 'mass';
  return 'other';
}

/** True when a source/reporting unit is a mass concentration (µg, ng, mg, g, pg). */
export function unitLooksMass(unit: string): boolean {
  const u = unit.toLowerCase().replace('µ', 'u').replace('μ', 'u');
  return /^(ug|ng|mg|g|pg)(\/|$)/i.test(u) || (/\/(l|ml|dl)$/i.test(u) && /^(ug|ng|mg|g|pg)/i.test(u));
}

/** True when a source/reporting unit is a molar concentration. */
export function unitLooksMolar(unit: string): boolean {
  const u = unit.toLowerCase().replace('µ', 'u').replace('μ', 'u');
  return /(mol|mmol|umol|nmol|pmol)/i.test(u);
}

/**
 * Detect LOINC property vs unit mismatches (D-e).
 * Returns biomarkers where LOINC FSN is [Moles/volume] but the source unit is mass.
 */
export function detectPropertyMismatches(layer: AnchorLayerV1): Biomarker[] {
  return layer.biomarkers.filter((b) => {
    return loincProperty(b.loinc_display) === 'moles' && unitLooksMass(b.unit_source) && !unitLooksMolar(b.unit_source);
  });
}

/** True when this id is an interpretive band, not a measured reference interval (D-c). */
export function isInterpretiveBandId(intervalId: string, layer?: AnchorLayerV1): boolean {
  const data = layer ?? loadAnchorLayer();
  return data.interpretive_bands.some((b) => b.interval_id === intervalId);
}
