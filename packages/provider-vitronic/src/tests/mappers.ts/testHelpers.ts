import { patientUuid } from '@open-twin/fhir-core';
import type { Identifier, Reference } from 'fhir/r4';
import type { Marker } from '../../api/schemas/marker';
import type { Scope } from '../../config/constants';
import { type MeasurementContext, measurementContext } from '../../fhir/mappers/shared';

/** D3: Foundation-controlled, not the vendor documentation URL it used to be. */
export const VITRONIC = 'http://opentwin.ch/fhir/CodeSystem/vitronic';
export const VITRONIC_IDENTIFIER = 'http://opentwin.ch/fhir/sid/vitronic';
export const UCUM = 'http://unitsofmeasure.org';
export const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';
export const DATA_ABSENT_REASON = 'http://terminology.hl7.org/CodeSystem/data-absent-reason';

export const SCAN_ID = 'scan-123';
export const SUBJECT_KEY = 'proband/1';
export const RECORDED_AT = '2026-07-25T09:15:00+02:00';

export const CONTEXT: MeasurementContext = measurementContext({
  scanId: SCAN_ID,
  subjectKey: SUBJECT_KEY,
  effectiveDateTime: RECORDED_AT
});

/** What `subjectReference` derives when the caller supplies nothing (D1). */
export const SUBJECT: Reference = { reference: `urn:uuid:${patientUuid('vitronic', SUBJECT_KEY)}` };

export function measurementIdentifierFor(scope: Scope, path: string): Identifier {
  return { system: VITRONIC_IDENTIFIER, value: `scan/${SCAN_ID}/${scope}/${path}` };
}

export const SCAN_REFERENCE: Reference = {
  type: 'ImagingStudy',
  identifier: { system: VITRONIC_IDENTIFIER, value: `scan/${SCAN_ID}` },
  display: `BodyLoop scan ${SCAN_ID}`
};

export function markerReferenceFor(markerPath: string, role: string): Reference {
  return {
    type: 'Observation',
    identifier: measurementIdentifierFor('marker', markerPath),
    display: `${role}: ${markerPath}`
  };
}

export function makeMarker(overrides: Partial<Marker> = {}): Marker {
  return {
    marker_type: 'anatomical',
    marker_path: 'marker/default',
    position: [0, 0, 0],
    normal: [0, 0, 0],
    ...overrides
  };
}
