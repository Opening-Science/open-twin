/**
 * WHAT: Typed, explicit ingest failures for Anchor → FHIR mapping.
 * NOT:  Does not treat a missing reference interval as an error — that is null / abstain (D-a).
 * GOVERNED BY: docs/contracts/fhir-core.md; DECISIONS.md#d11
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */

export type AnchorIngestErrorCode =
  | 'unknown_code'
  | 'unit_incommensurable'
  | 'physiologically_impossible'
  /** D-c: interpretive band used where a measured reference interval is required. */
  | 'interpretive_band_not_reference_interval';

export class AnchorIngestError extends Error {
  readonly code: AnchorIngestErrorCode;
  readonly biomarker_id?: string;
  readonly loinc_code?: string;

  constructor(
    code: AnchorIngestErrorCode,
    message: string,
    meta: { biomarker_id?: string; loinc_code?: string } = {},
  ) {
    super(message);
    this.name = 'AnchorIngestError';
    this.code = code;
    this.biomarker_id = meta.biomarker_id;
    this.loinc_code = meta.loinc_code;
  }
}

export function isAnchorIngestError(err: unknown): err is AnchorIngestError {
  return err instanceof AnchorIngestError;
}
