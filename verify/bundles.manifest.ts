import {
  buildBundle,
  CATEGORY,
  createObservation,
  deterministicId,
  numericComponent,
  PROFILES,
  patientUuid,
  quantity,
  RANGE_TYPE,
  referenceInterval,
  SYSTEMS,
  subjectReference,
  UCUM
} from '@open-twin/fhir-core';
import type { Bundle, FhirResource, Patient } from 'fhir/r4';
import { aggregateBundle } from '../packages/aggregate/src/verification/exampleBundle';
import { fhirR4IngestBundle } from '../packages/fhir-r4/src/verification/exampleBundle';
import { genomicsVcfBundle } from '../packages/genomics-vcf/src/verification/exampleBundle';
import { hl7v2OruBundle } from '../packages/hl7v2/src/verification/exampleBundle';
import { googleHealthBundle } from '../packages/provider-google-health/src/verification/exampleBundle';
import { openWearablesBundle } from '../packages/provider-open-wearables/src/verification/exampleBundle';
import { ouraBundle } from '../packages/provider-oura/src/verification/exampleBundle';
import { ouraSandboxBundle } from '../packages/provider-oura/src/verification/sandboxBundle';
import { buildVitronicExemplarBundle } from '../packages/provider-vitronic/src/tests/fixtures/exemplarBundle';

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

/**
 * The Anchor layer's central finding, put in front of the validator.
 *
 * One HbA1c result carrying two intervals from the same laboratory that disagree:
 * a 2025 diagnostic cutoff and a 2015 population range. If FHIR could not express
 * this, the Anchor design would need a custom model. It can, so it does not.
 */
function anchorHbA1c(): Bundle {
  const subject = subjectReference({ connector: 'anchor', subjectKey: 'exemplar-subject' });
  const source2025 = {
    url: 'https://www.imd-berlin.de/fileadmin/user_upload/leistungsverzeichnis_druck/imd_leistungsverzeichnis_2025-03-06.pdf',
    publisher: 'IMD Berlin, Leistungsverzeichnis',
    retrieved: '2026-07-12',
    version: '2025-02-12'
  };
  const source2015 = {
    url: 'https://www.imd-berlin.de/fileadmin/user_upload/leistungsverzeichnis_druck/09a_Referenzbereiche_Standort_Potsdam.pdf',
    publisher: 'IMD Labor Berlin-Potsdam, Referenzbereiche',
    retrieved: '2026-07-12',
    version: '2015-09-28'
  };

  const hba1c = createObservation({
    id: deterministicId({
      connector: 'anchor',
      subjectKey: 'exemplar-subject',
      recordId: 'imd-2026-07-12',
      measure: 'hba1c'
    }),
    code: { system: SYSTEMS.LOINC, code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' },
    category: CATEGORY.LABORATORY,
    subject,
    effectiveDateTime: '2026-07-12T09:00:00+02:00',
    valueQuantity: quantity(5.9, UCUM.PERCENT),
    referenceRange: [
      referenceInterval({
        high: 5.7,
        unit: UCUM.PERCENT,
        type: RANGE_TYPE.RECOMMENDED,
        source: source2025,
        text: '< 5,7 %'
      }),
      referenceInterval({
        low: 4.7,
        high: 6.2,
        unit: UCUM.PERCENT,
        type: RANGE_TYPE.NORMAL,
        source: source2015,
        text: '4,7 - 6,2 %'
      })
    ]
  });

  // The abstain case, in the same bundle: a result whose interval never arrived.
  const ferritin = createObservation({
    id: deterministicId({
      connector: 'anchor',
      subjectKey: 'exemplar-subject',
      recordId: 'imd-2026-07-12',
      measure: 'ferritin'
    }),
    code: { system: SYSTEMS.LOINC, code: '2276-4', display: 'Ferritin [Mass/volume] in Serum or Plasma' },
    category: CATEGORY.LABORATORY,
    subject,
    effectiveDateTime: '2026-07-12T09:00:00+02:00',
    valueQuantity: quantity(38, UCUM.MICROGRAM_PER_LITRE)
  });

  const patient: Patient = {
    resourceType: 'Patient',
    id: patientUuid('anchor', 'exemplar-subject'),
    identifier: [{ system: SYSTEMS.OURA_IDENTIFIER, value: 'exemplar-subject' }]
  };

  return buildBundle({
    connector: { connector: 'anchor', version: '0.1.0' },
    resources: [patient, hba1c, ferritin],
    timestamp: TIMESTAMP,
    bundleKey: 'anchor-hba1c'
  });
}

export const BUNDLE_CASES: BundleCase[] = [
  { name: 'anchor-hba1c', build: anchorHbA1c },
  { name: 'fhir-core-exemplar', build: exemplar },
  { name: 'oura-sync', build: ouraBundle },
  // The recorded sandbox capture: real Oura payloads, all thirteen scopes.
  { name: 'oura-sandbox-real', build: ouraSandboxBundle },
  // Two connectors reconciled: exercises derivedFrom and the open-twin method system.
  { name: 'aggregate-two-sources', build: aggregateBundle },
  { name: 'google-health-sync', build: googleHealthBundle },
  { name: 'vitronic-scan', build: buildVitronicExemplarBundle },
  { name: 'fhir-r4-ingest', build: fhirR4IngestBundle },
  { name: 'hl7v2-oru-r01', build: hl7v2OruBundle },
  { name: 'genomics-vcf-hiseq', build: genomicsVcfBundle },
  { name: 'open-wearables-sync', build: openWearablesBundle }
];
