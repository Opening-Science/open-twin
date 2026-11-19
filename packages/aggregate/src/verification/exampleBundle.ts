/**
 * WHAT: Emits synthetic configured reconciliation and basic bundles for structural validation.
 * NOT:  Does not claim these synthetic declaration sets describe actual connector output.
 * GOVERNED BY: DECISIONS.md#d20
 * CORRECTNESS: HL7 validator (CI emit-bundles).
 */
import {
  buildBundle,
  createObservation,
  declareMeasurement,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementDeclarationSet,
  minimalPatient,
  quantity,
  SYSTEMS,
  subjectReference,
  UCUM,
  type UcumUnit
} from '@open-twin/fhir-core';
import type { Bundle, FhirResource, Observation, Patient } from 'fhir/r4.js';
import { aggregate } from '../aggregate';
import { createMeasurementCatalogue } from '../catalogue';
import { generateReconciliationConfiguration } from '../configuration';

/**
 * Two connectors describing one night and one day, reconciled, for the HL7 validator.
 *
 * The point of validating this one is the resource the other bundles do not have: a
 * derived Observation carrying `derivedFrom` into resources in the same bundle and a
 * `method` under an open-twin CodeSystem. Both are the kind of thing that validates in
 * the abstract and fails in a bundle — a `derivedFrom` reference has to resolve, and an
 * undeclared CodeSystem is exactly what the conformance stage exists to catch.
 *
 * It carries the two outcomes that matter, side by side:
 *
 *   - sleep duration is reconciled and a derived Observation is emitted;
 *   - session energy abstains because the configured preferred source has no value.
 */

const SUBJECT_KEY = 'aggregate-exemplar';
// One subject for every connector. Each would otherwise mint its own from
// patientUuid(connector, key), and the aggregator refuses to reconcile across subjects.
const SUBJECT = subjectReference({ connector: 'open-twin', subjectKey: SUBJECT_KEY });
const TIMESTAMP = '2026-07-27T10:00:00Z';
const DAY = '2026-06-20';

const patient: Patient = minimalPatient({
  connector: 'open-twin',
  subjectKey: SUBJECT_KEY,
  identifierSystem: 'http://opentwin.ch/fhir/sid/open-twin'
});

function reading(id: string, code: string, value: number, unit: UcumUnit): Observation {
  return createObservation({
    id,
    code: { system: SYSTEMS.LOINC, code },
    subject: SUBJECT,
    effectivePeriod: { start: `${DAY}T22:00:00Z`, end: '2026-06-21T06:00:00Z' },
    valueQuantity: quantity(value, unit)
  });
}

function sourceBundle(connector: string, resources: Observation[]): Bundle {
  return buildBundle({
    connector: { connector, version: '0.1.0' },
    resources,
    timestamp: TIMESTAMP,
    bundleKey: `${connector}|${SUBJECT_KEY}|${DAY}`
  });
}

function registration(connector: string): MeasurementDeclarationSet {
  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    connector,
    version: 1,
    coverage: 'complete',
    definitions: [],
    declarations: [
      declareMeasurement('total-sleep-time', { system: SYSTEMS.LOINC, code: '93832-4' }),
      declareMeasurement('session-energy-expenditure', { system: SYSTEMS.LOINC, code: '41981-2' })
    ]
  };
}

export function aggregateBundle(reconciliationEnabled = true): Bundle {
  const alpha = sourceBundle('synthetic-alpha', [
    {
      ...reading('11110000-0000-5000-8000-000000000001', '93832-4', 402, UCUM.MINUTE),
      device: { reference: '#sensor' },
      contained: [{ resourceType: 'Device', id: 'sensor' }]
    },
    {
      ...reading('11110000-0000-5000-8000-000000000002', '41981-2', 2300, UCUM.KILOCALORIE),
      valueQuantity: undefined,
      dataAbsentReason: { coding: [{ system: SYSTEMS.DATA_ABSENT_REASON, code: 'unknown' }] }
    }
  ]);
  const beta = sourceBundle('synthetic-beta', [
    reading('22220000-0000-5000-8000-000000000001', '93832-4', 415, UCUM.MINUTE),
    reading('22220000-0000-5000-8000-000000000002', '41981-2', 2650, UCUM.KILOCALORIE)
  ]);

  const catalogue = createMeasurementCatalogue([registration('synthetic-alpha'), registration('synthetic-beta')]);
  const configuration = generateReconciliationConfiguration(catalogue);
  const { bundle } = aggregate({
    sources: [{ bundle: alpha }, { bundle: beta }],
    subjectKey: SUBJECT_KEY,
    timestamp: TIMESTAMP,
    reconciliation: reconciliationEnabled ? { enabled: true, catalogue, configuration } : { enabled: false }
  });

  // The Patient the sources' subject reference points at. The connectors did not carry
  // one because the integrator supplied the subject, so the aggregate bundle is where
  // it has to appear for the reference to resolve inside it.
  return {
    ...bundle,
    entry: [{ fullUrl: `urn:uuid:${patient.id}`, resource: patient }, ...(bundle.entry ?? [])]
  };
}

export function aggregateContainedBundle(): Bundle {
  const contained: FhirResource[] = [
    { resourceType: 'Patient', id: 'person' },
    { resourceType: 'Device', id: 'sensor', owner: { reference: '#organization' } },
    { resourceType: 'Organization', id: 'organization', name: 'Synthetic organization' }
  ];
  const observation: Observation = {
    ...reading('33330000-0000-5000-8000-000000000001', '93832-4', 402, UCUM.MINUTE),
    subject: { reference: '#person' },
    device: { reference: '#sensor' },
    contained
  };
  const catalogue = createMeasurementCatalogue([registration('synthetic-alpha'), registration('synthetic-beta')]);
  return aggregate({
    sources: [{ bundle: sourceBundle('synthetic-alpha', [observation]) }],
    subjectKey: SUBJECT_KEY,
    timestamp: TIMESTAMP,
    reconciliation: {
      enabled: true,
      catalogue,
      configuration: generateReconciliationConfiguration(catalogue)
    }
  }).bundle;
}

export function aggregateRelativeBundle(): Bundle {
  const base = 'https://example.test/fhir';
  const contained: FhirResource[] = [
    { resourceType: 'Device', id: 'sensor', owner: { reference: 'Organization/owner' } }
  ];
  const observation: Observation = {
    ...reading('44440000-0000-5000-8000-000000000001', '93832-4', 402, UCUM.MINUTE),
    subject: { reference: 'Patient/person' },
    device: { reference: '#sensor' },
    performer: [{ reference: 'Practitioner/operator' }],
    specimen: { reference: 'Specimen/sample' },
    effectivePeriod: { start: '2026-06-21T00:00:00+02:00', end: '2026-06-21T08:00:00+02:00' },
    contained
  };
  const resources: FhirResource[] = [
    observation,
    { resourceType: 'Patient', id: 'person' },
    { resourceType: 'Organization', id: 'owner', name: 'Synthetic organization' },
    { resourceType: 'Practitioner', id: 'operator' },
    { resourceType: 'Specimen', id: 'sample', subject: { reference: 'Patient/person' } }
  ];
  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: resources.map((resource) => ({ fullUrl: `${base}/${resource.resourceType}/${resource.id}`, resource }))
  };
  const catalogue = createMeasurementCatalogue([registration('synthetic-alpha'), registration('synthetic-beta')]);
  return aggregate({
    sources: [{ connector: 'synthetic-alpha', bundle }],
    subjectKey: SUBJECT_KEY,
    timestamp: TIMESTAMP,
    reconciliation: {
      enabled: true,
      catalogue,
      configuration: generateReconciliationConfiguration(catalogue)
    }
  }).bundle;
}
