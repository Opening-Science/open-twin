/**
 * WHAT: Public API for Anchor biomarker → FHIR R4 Observation ingest.
 * NOT:  Does not implement interpretation rules or population selection.
 * GOVERNED BY: docs/contracts/fhir-core.md; packages/anchor-layer/data/anchor-layer.v1.json
 * CORRECTNESS: Round-trip / fixture tests for bundle shape; HL7 validator not yet run locally (no JRE) — external authority gap, not an oversight.
 */

export { AnchorIngestError, isAnchorIngestError, type AnchorIngestErrorCode } from './errors.js';
export {
  type CollectionContext,
  type MenstrualCyclePhase,
  type TimeOfDayWindow,
  type AdministrativeGender,
  COLLECTION_CONTEXT_EXTENSION,
  EXT_CYCLE_PHASE,
  EXT_FASTING,
  EXT_TOD_WINDOW,
} from './context.js';
export {
  getAnchorCatalogue,
  getBiomarker,
  getReferenceInterval,
  intervalsForBiomarker,
} from './catalogue.js';
export {
  loincPropertyClass,
  unitCommensurableWithLoinc,
  resolveUcumUnit,
  type LoincPropertyClass,
} from './units.js';
export {
  PHYSIOLOGICAL_ENVELOPES,
  isPhysiologicallyPossible,
  type PhysiologicalEnvelope,
} from './physiology.js';
export {
  CONNECTOR,
  mapBiomarkerToObservation,
  type BiomarkerMeasurement,
} from './fhir/mapObservation.js';
export { buildCollectionBundle, type CollectionEventInput } from './fhir/bundleBuilder.js';
export {
  ALL_MARKER_CLASS_FIXTURES,
  type MarkerClassFixture,
  type MarkerClassId,
} from './fixtures/markerClasses.js';
export {
  bundleFromMarkerClassFixture,
  allMarkerClassBundles,
  anchorFerritinBundle,
} from './verification/exampleBundles.js';
