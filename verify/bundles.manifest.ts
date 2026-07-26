import {
  buildBundle,
  CATEGORY,
  createObservation,
  deterministicId,
  numericComponent,
  PROFILES,
  patientUuid,
  quantity,
  SYSTEMS,
  subjectReference,
  UCUM
} from '@open-twin/fhir-core';
import type { Bundle, FhirResource, Patient } from 'fhir/r4';
import { genomicsVcfBundle } from '../packages/genomics-vcf/src/verification/exampleBundle';

/**
 * Bundles handed to the HL7 validator in CI.
 *
 * Each connector registers its own entry here as it adopts `@open-twin/fhir-core`,
 * built from a recorded vendor payload rather than a hand-written literal. The
 * exemplar below exists so the validator stage is proven from the first commit
 * instead of being merged untested, which is what `ci/verify.yml` shipped as: it
 * invoked `verify/emit-bundles.mjs`, a script that did not exist.
 */
export interface BundleCase {
  name: string;
  build(): Bundle;
}

const CONNECTOR = { connector: 'fhir-core', version: '0.1.0' };
const SUBJECT_KEY = 'exemplar-subject';
const TIMESTAMP = '2026-07-26T10:00:00Z';

function exemplar(): Bundle {
  const subject = subjectReference({ connector: CONNECTOR.connector, subjectKey: SUBJECT_KEY });

  const patient: Patient = {
    resourceType: 'Patient',
    id: patientUuid(CONNECTOR.connector, SUBJECT_KEY),
    identifier: [{ system: SYSTEMS.OURA_IDENTIFIER, value: SUBJECT_KEY }],
    gender: 'female'
  };

  // Vital signs, declaring the profiles the validator applies anyway. The unit on
  // each is the one the profile *fixes* — not merely binds — so these fail loudly
  // if the unit policy in `@open-twin/fhir-core` ever drifts.
  const heartRate = createObservation({
    id: deterministicId({
      connector: CONNECTOR.connector,
      subjectKey: SUBJECT_KEY,
      recordId: 'exemplar',
      measure: 'heart-rate'
    }),
    code: { system: SYSTEMS.LOINC, code: '8867-4', display: 'Heart rate' },
    category: CATEGORY.VITAL_SIGNS,
    subject,
    effectiveDateTime: '2026-07-26T09:30:00+02:00',
    valueQuantity: quantity(62, UCUM.PER_MINUTE),
    profiles: [PROFILES.HEART_RATE]
  });

  const bodyHeight = createObservation({
    id: deterministicId({
      connector: CONNECTOR.connector,
      subjectKey: SUBJECT_KEY,
      recordId: 'exemplar',
      measure: 'body-height'
    }),
    code: { system: SYSTEMS.LOINC, code: '8302-2', display: 'Body height' },
    category: CATEGORY.VITAL_SIGNS,
    subject,
    effectiveDateTime: '2026-07-26T09:30:00+02:00',
    valueQuantity: quantity(171, UCUM.CENTIMETRE),
    profiles: [PROFILES.BODY_HEIGHT]
  });

  // A vendor-specific measure under a Foundation-controlled code system, with a
  // component whose value is absent — asserting that dataAbsentReason is emitted
  // rather than a zero or a unit with no value.
  const readiness = createObservation({
    id: deterministicId({
      connector: CONNECTOR.connector,
      subjectKey: SUBJECT_KEY,
      recordId: 'exemplar',
      measure: 'readiness'
    }),
    code: { system: SYSTEMS.OURA, code: 'readiness-score', display: 'Oura Readiness Score' },
    category: CATEGORY.SURVEY,
    subject,
    effectiveDateTime: '2026-07-26T09:30:00+02:00',
    valueQuantity: quantity(84, UCUM.SCORE),
    components: [numericComponent({ system: SYSTEMS.OURA, code: 'hrv-balance' }, undefined, UCUM.SCORE)]
  });

  const resources: FhirResource[] = [patient, heartRate, bodyHeight, readiness];
  return buildBundle({ connector: CONNECTOR, resources, timestamp: TIMESTAMP, bundleKey: 'fhir-core-exemplar' });
}

<<<<<<< HEAD
export const BUNDLE_CASES: BundleCase[] = [
  { name: 'fhir-core-exemplar', build: exemplar },
  { name: 'genomics-vcf-hiseq', build: genomicsVcfBundle }
];
=======
export const BUNDLE_CASES: BundleCase[] = [{ name: 'fhir-core-exemplar', build: exemplar }];
>>>>>>> open-twin/foundation
