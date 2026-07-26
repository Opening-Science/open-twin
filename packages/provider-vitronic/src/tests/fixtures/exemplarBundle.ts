/**
 * The bundle the HL7 validator checks in CI, built from the connector's own
 * mappers so it cannot drift from what the library emits.
 *
 * Registered in `verify/bundles.manifest.ts`.
 */
import type { Bundle } from 'fhir/r4';
import { buildBundleFromVitronicResponse } from '../../fhir/bundleBuilder';
import { samplePayload } from './samplePayload';

export const EXEMPLAR_SCAN_ID = '4711';
export const EXEMPLAR_SUBJECT_KEY = 'proband/1';
/** Fixed so the bundle is byte-reproducible between runs. */
export const EXEMPLAR_RECORDED_AT = '2026-07-25T09:15:00+02:00';

export function buildVitronicExemplarBundle(): Bundle {
  return buildBundleFromVitronicResponse({
    scan_id: EXEMPLAR_SCAN_ID,
    subjectKey: EXEMPLAR_SUBJECT_KEY,
    effectiveDateTime: EXEMPLAR_RECORDED_AT,
    timestamp: EXEMPLAR_RECORDED_AT,
    angle: samplePayload('angle'),
    axis: samplePayload('axis'),
    cross_section: samplePayload('cross_section'),
    distance: samplePayload('distance'),
    height: samplePayload('height'),
    marker: samplePayload('marker'),
    properties: samplePayload('properties')
  });
}
