/**
 * WHAT: Assembles one FHIR Bundle per Anchor collection event (Patient, Device, Observations).
 * NOT:  Does not interpret or select populations; does not merge multiple collection events.
 * GOVERNED BY: docs/contracts/health-bundle.md; docs/contracts/fhir-core.md
 * CORRECTNESS: Round-trip / fixture tests for bundle shape; HL7 validator not yet run locally (no JRE) — external authority gap, not an oversight.
 */
import {
  buildBundle,
  connectorDevice,
  deviceReference,
  patientUuid,
  SYSTEMS,
} from '@open-twin/fhir-core';
import type { Bundle, FhirResource, Patient } from 'fhir/r4';
import type { CollectionContext } from '../context.js';
import {
  CONNECTOR,
  mapBiomarkerToObservation,
  type BiomarkerMeasurement,
} from './mapObservation.js';

export interface CollectionEventInput {
  context: CollectionContext;
  measurements: BiomarkerMeasurement[];
  /** Bundle.timestamp — reproducible in tests. */
  bundleTimestamp: string;
}

/**
 * One collection event → one Bundle.
 * Subject demographics (sex, birthDate) and collection extensions travel so the
 * interpreter can select populations later — this function does not select them.
 */
export function buildCollectionBundle(input: CollectionEventInput): Bundle {
  const { context, measurements, bundleTimestamp } = input;

  const patientId = patientUuid(CONNECTOR.connector, context.subjectKey);
  const patient: Patient = {
    resourceType: 'Patient',
    id: patientId,
    identifier: [{ system: SYSTEMS.ANCHOR_IDENTIFIER, value: context.subjectKey }],
    gender: context.sex,
    birthDate: context.birthDate,
  };

  const device = connectorDevice({
    connector: CONNECTOR.connector,
    deviceKey: context.deviceKey ?? 'imd-lab',
    manufacturer: context.deviceManufacturer ?? 'IMD Labor',
    model: context.deviceModel,
    version: CONNECTOR.version,
  });
  const deviceRef = deviceReference(device);

  const observations = measurements.map((m) =>
    mapBiomarkerToObservation(m, context, deviceRef),
  );

  const resources: FhirResource[] = [patient, device, ...observations];

  return buildBundle({
    connector: CONNECTOR,
    resources,
    timestamp: bundleTimestamp,
    bundleKey: `anchor|${context.collectionEventId}`,
  });
}
