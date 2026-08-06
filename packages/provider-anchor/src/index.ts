/**
 * WHAT: Public API for Anchor biomarker → FHIR R4 Observation ingest.
 * NOT:  Does not implement interpretation rules or population selection.
 * GOVERNED BY: docs/contracts/fhir-core.md; packages/anchor-layer/data/anchor-layer.v1.json
 * CORRECTNESS: Round-trip / fixture tests for bundle shape; HL7 validator not yet run locally (no JRE) — external authority gap, not an oversight.
 */

export {
  getAnchorCatalogue,
  getBiomarker,
  getReferenceInterval,
  intervalsForBiomarker
} from './catalogue.js';
export {
  type AdministrativeGender,
  COLLECTION_CONTEXT_EXTENSION,
  type CollectionContext,
  EXT_CYCLE_PHASE,
  EXT_FASTING,
  EXT_TOD_WINDOW,
  type MenstrualCyclePhase,
  type TimeOfDayWindow
} from './context.js';
export { AnchorIngestError, type AnchorIngestErrorCode, isAnchorIngestError } from './errors.js';
export { buildCollectionBundle, type CollectionEventInput } from './fhir/bundleBuilder.js';
export {
  type BiomarkerMeasurement,
  CONNECTOR,
  mapBiomarkerToObservation
} from './fhir/mapObservation.js';
export {
  ALL_MARKER_CLASS_FIXTURES,
  type MarkerClassFixture,
  type MarkerClassId
} from './fixtures/markerClasses.js';
export {
  isPhysiologicallyPossible,
  PHYSIOLOGICAL_ENVELOPES,
  type PhysiologicalEnvelope
} from './physiology.js';
export {
  type LoincPropertyClass,
  loincPropertyClass,
  resolveUcumUnit,
  unitCommensurableWithLoinc
} from './units.js';
export {
  allMarkerClassBundles,
  anchorFerritinBundle,
  bundleFromMarkerClassFixture
} from './verification/exampleBundles.js';
