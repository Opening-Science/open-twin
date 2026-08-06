/**
 * WHAT: Loads Anchor biomarker and reference-interval records for FHIR ingest.
 * NOT:  Does not select populations; does not invent LOINC/UCUM codes.
 * GOVERNED BY: packages/anchor-layer/data/anchor-layer.v1.json; docs/contracts/anchor-organ-to-system.md
 * CORRECTNESS: Anchor artefact sha256 sidecar; LOINC review records under docs/terminology/review-records/
 */
import {
  type AnchorLayerV1,
  isInterpretiveBandId as anchorIsInterpretiveBandId,
  type Biomarker,
  type InterpretiveBand,
  loadAnchorLayer,
  type ReferenceInterval
} from '@open-twin/anchor-layer';

/** Thin wrap — avoids a barrel re-export that biome flags as noBarrelFile. */
export function isInterpretiveBandId(intervalId: string): boolean {
  return anchorIsInterpretiveBandId(intervalId);
}

let cached: AnchorLayerV1 | undefined;

export function getAnchorCatalogue(layer?: AnchorLayerV1): AnchorLayerV1 {
  if (layer) {
    cached = layer;
    return layer;
  }
  if (!cached) cached = loadAnchorLayer();
  return cached;
}

export function getBiomarker(biomarkerId: string, layer?: AnchorLayerV1): Biomarker | undefined {
  return getAnchorCatalogue(layer).biomarkers.find((b) => b.biomarker_id === biomarkerId);
}

export function getReferenceInterval(intervalId: string, layer?: AnchorLayerV1): ReferenceInterval | undefined {
  return getAnchorCatalogue(layer).reference_intervals.find((r) => r.interval_id === intervalId);
}

export function getInterpretiveBand(intervalId: string, layer?: AnchorLayerV1): InterpretiveBand | undefined {
  return getAnchorCatalogue(layer).interpretive_bands.find((b) => b.interval_id === intervalId);
}

export function intervalsForBiomarker(biomarkerId: string, layer?: AnchorLayerV1): ReferenceInterval[] {
  return getAnchorCatalogue(layer).reference_intervals.filter((r) => r.biomarker_id === biomarkerId);
}
