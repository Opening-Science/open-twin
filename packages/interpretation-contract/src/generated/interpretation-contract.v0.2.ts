/**
 * GENERATED from docs/contracts/interpretation-contract.v0.2.schema.json — do not edit.
 * Regenerate: pnpm --filter @open-twin/interpretation-contract generate
 */

/**
 * Closed enum owned by open-twin-openXR (D8 / D-f). This repository CONSUMES it. No tenth value.
 *
 * This interface was referenced by `OpenTwinInterpretationDocumentV02`'s JSON-Schema
 * via the `definition` "SystemId".
 */
export type SystemId =
  | 'musculoskeletal'
  | 'cardiovascular'
  | 'nervous'
  | 'respiratory'
  | 'metabolic'
  | 'digestive'
  | 'endocrine'
  | 'integumentary'
  | 'reproductive';
/**
 * Ordinal severity (D-i). Not a float — a float implies a calibration the rules do not have.
 *
 * This interface was referenced by `OpenTwinInterpretationDocumentV02`'s JSON-Schema
 * via the `definition` "Severity".
 */
export type Severity = 'none' | 'borderline' | 'mild' | 'moderate' | 'marked' | 'indeterminate';
/**
 * Status of a marker the rule read, including absences (D-k).
 *
 * This interface was referenced by `OpenTwinInterpretationDocumentV02`'s JSON-Schema
 * via the `definition` "ContributorStatus".
 */
export type ContributorStatus = 'present' | 'missing' | 'stale' | 'no_reference_interval' | 'unit_incommensurable';
/**
 * Provenance of the anatomy assignment (D-h). The LOINC System axis is a specimen, not a site of pathology — value "loinc_system_axis" is REJECTED by CI.
 *
 * This interface was referenced by `OpenTwinInterpretationDocumentV02`'s JSON-Schema
 * via the `definition` "InterpretiveAnatomySource".
 */
export type InterpretiveAnatomySource = 'curated_table';
/**
 * This interface was referenced by `OpenTwinInterpretationDocumentV02`'s JSON-Schema
 * via the `definition` "UnrenderableReason".
 */
export type UnrenderableReason = 'no_system_id_upstream' | 'not_anatomical' | 'system_excluded_upstream';

/**
 * Sole interface between the open-twin interpretation layer and the open-twin-openXR visualisation layer. Schema is the source of truth; TypeScript types are generated from this file.
 */
export interface OpenTwinInterpretationDocumentV02 {
  /**
   * Contract version. Consumers must reject unknown versions.
   */
  schema_version: 'interpretation-contract.v0.2';
  /**
   * MDR Annex VIII Rule 11 line (D-m). Visualising a person's own data can sit outside MDR; generating recommendations cannot. This document never carries recommendations.
   */
  intended_use: 'research_hypothesis_generation_n_of_1';
  /**
   * Always true. A false value is non-conformant (D-m).
   */
  not_for_diagnostic_use: true;
  /**
   * Opaque subject reference (e.g. Patient fullUrl or research pseudonym). Not a display name.
   */
  subject_ref: string;
  /**
   * Instant the interpretation document was produced (UTC).
   */
  as_of: string;
  /**
   * Per-SystemId interpretive states for systems the XR layer can colour. Markers with no SystemId home must appear only under unrenderable[] (D-g).
   */
  states: SystemState[];
  /**
   * States that must not be painted onto anatomy. Never drop; never reroute into a neighbouring SystemId (D-g).
   */
  unrenderable: UnrenderableState[];
}
/**
 * This interface was referenced by `OpenTwinInterpretationDocumentV02`'s JSON-Schema
 * via the `definition` "SystemState".
 */
export interface SystemState {
  system_id: SystemId;
  severity: Severity;
  /**
   * RULE-SUPPORT in [0,1], defined as completeness × recency × rule_strength. This is NOT a probability of disease and must not be rendered as risk. See docs/contracts/confidence.md (D-j).
   */
  confidence: number;
  /**
   * When false the state is still EMITTED with its reason. A region with no data must never be renderable as healthy (D-k).
   */
  sufficient_data: boolean;
  /**
   * Required by conformance when sufficient_data is false.
   */
  insufficient_reason?: string;
  /**
   * Every marker the rule read, INCLUDING missing ones (D-k).
   *
   * @minItems 1
   */
  contributing: [Contributor, ...Contributor[]];
  interpretive_anatomy_source: InterpretiveAnatomySource;
  geometry: Geometry;
}
/**
 * This interface was referenced by `OpenTwinInterpretationDocumentV02`'s JSON-Schema
 * via the `definition` "Contributor".
 */
export interface Contributor {
  /**
   * Stable marker id from the Anchor layer (e.g. BM-072).
   */
  biomarker_id: string;
  /**
   * Optional LOINC code the rule bound for this contributor.
   */
  loinc_code?: string;
  status: ContributorStatus;
  /**
   * Observation instant when status is present or stale; null when missing.
   */
  observed_at?: string | null;
  /**
   * Interval the observation was measured against, or null when the interpreter abstains (D-a).
   */
  reference_interval_id?: string | null;
}
/**
 * Geometry keys for XR join (D-l). Joins run FMA → UBERON, never the reverse. Prefer FMA when both bridges resolve. body_structure_snomed is INTERNAL ONLY and must not appear in published documents.
 *
 * This interface was referenced by `OpenTwinInterpretationDocumentV02`'s JSON-Schema
 * via the `definition` "Geometry".
 */
export interface Geometry {
  /**
   * Primary geometry key (Foundational Model of Anatomy CURIE).
   */
  fma_id: string;
  /**
   * Secondary semantic / query key. Joined from FMA, never the reverse.
   */
  uberon_id?: string;
}
/**
 * This interface was referenced by `OpenTwinInterpretationDocumentV02`'s JSON-Schema
 * via the `definition` "UnrenderableState".
 */
export interface UnrenderableState {
  /**
   * Stable id for this unrenderable group (e.g. cbc_block).
   */
  id: string;
  /**
   * Human-readable label for research UI (not painted on anatomy).
   */
  label?: string;
  reason: UnrenderableReason;
  severity: Severity;
  /**
   * RULE-SUPPORT in [0,1] — completeness × recency × rule_strength; NOT probability of disease (D-j).
   */
  confidence: number;
  sufficient_data: boolean;
  /**
   * Required by conformance when sufficient_data is false.
   */
  insufficient_reason?: string;
  /**
   * @minItems 1
   */
  contributing: [Contributor, ...Contributor[]];
}
