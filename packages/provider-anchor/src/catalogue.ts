/**
 * WHAT: Loads Anchor biomarker and reference-interval records for FHIR ingest.
 * NOT:  Does not select populations; does not invent LOINC/UCUM codes.
 * GOVERNED BY: packages/anchor-layer/data/anchor-layer.v1.json; docs/contracts/anchor-organ-to-system.md
 * CORRECTNESS: Anchor artefact sha256 sidecar; LOINC review records under docs/terminology/review-records/
 */
import {
  loadAnchorLayer,
  type AnchorLayerV1,
  type Biomarker,
  type InterpretiveBand,
  type ReferenceInterval,
} from '@open-twin/anchor-layer';

export { isInterpretiveBandId } from '@open-twin/anchor-layer';

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

export function getReferenceInterval(
  intervalId: string,
  layer?: AnchorLayerV1,
): ReferenceInterval | undefined {
  return getAnchorCatalogue(layer).reference_intervals.find((r) => r.interval_id === intervalId);
}

export function getInterpretiveBand(
  intervalId: string,
  layer?: AnchorLayerV1,
): InterpretiveBand | undefined {
  return getAnchorCatalogue(layer).interpretive_bands.find((b) => b.interval_id === intervalId);
}

export function intervalsForBiomarker(
  biomarkerId: string,
  layer?: AnchorLayerV1,
): ReferenceInterval[] {
  return getAnchorCatalogue(layer).reference_intervals.filter(
    (r) => r.biomarker_id === biomarkerId,
  );
}
