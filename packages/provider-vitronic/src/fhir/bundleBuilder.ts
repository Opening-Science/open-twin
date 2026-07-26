import { buildBundle, type ConnectorError, patientUuid, SYSTEMS, toOperationOutcome } from '@open-twin/fhir-core';
import type { Bundle, FhirResource, Observation, OperationOutcome, Patient, Reference } from 'fhir/r4';
import { asConnectorError, type BodyLoopClient } from '../api/client';
import type { AngleList } from '../api/schemas/angle';
import type { AxesList } from '../api/schemas/axes';
import type { CrossSectionList } from '../api/schemas/crosssection';
import type { DistanceList } from '../api/schemas/distance';
import type { HeightList } from '../api/schemas/height';
import type { MarkerList } from '../api/schemas/marker';
import type { PropertyList } from '../api/schemas/properties';
import type { Viatar } from '../api/schemas/viatars';
import type { Scope } from '../config/constants';
import { mapAngleListToFHIR } from './mappers/angle';
import { mapAxesListToFHIR } from './mappers/axes';
import { mapCrossSectionListToFHIR } from './mappers/crosssection';
import { mapDistanceListToFHIR } from './mappers/distance';
import { mapHeightListToFHIR } from './mappers/height';
import { mapMarkerListToFHIR } from './mappers/marker';
import { mapPropertyListToFHIR } from './mappers/properties';
import { CONNECTOR, measurementContext, toFhirDateTime, toFhirInstant } from './mappers/shared';

export interface VitronicMeasurementResponse {
  /** BodyLoop viatar id. The scan, not the person. */
  scan_id: string;
  /**
   * D1. Supplied by the caller, who knows who the patient is; the connector does
   * not. Without one a deterministic `urn:uuid:` subject is minted from
   * `subjectKey` and a matching Patient is added to the bundle.
   */
  subject?: Reference;
  /** Vendor key for the person, e.g. `proband/42`. Defaults to the scan. */
  subjectKey?: string;
  /** D7. Scan time from `Viatar.meta.crtime`, already normalised. */
  effectiveDateTime?: string;
  /** `Bundle.timestamp`, a FHIR instant. Defaults to now. */
  timestamp?: string;
  angle?: AngleList;
  axis?: AxesList;
  cross_section?: CrossSectionList;
  distance?: DistanceList;
  height?: HeightList;
  marker?: MarkerList;
  properties?: PropertyList;
}

/** D6: the bundle that was produced, plus what failed while producing it. */
export interface VitronicBundleResult {
  bundle: Bundle;
  issues?: OperationOutcome;
}

/**
 * The Patient the connector can honestly assert: an identifier and nothing else.
 *
 * `getProband` returns name, date of birth, gender, address and contact details.
 * Publishing those because a scan was fetched would export PHI the caller never
 * asked for, so the demographics stay where they are generated and an integrator
 * who needs them supplies `subject` instead.
 */
function patientFor(subjectKey: string): Patient {
  return {
    resourceType: 'Patient',
    id: patientUuid(CONNECTOR.connector, subjectKey),
    identifier: [{ system: SYSTEMS.VITRONIC_IDENTIFIER, value: subjectKey }]
  };
}

export function buildBundleFromVitronicResponse(response: VitronicMeasurementResponse): Bundle {
  const context = measurementContext({
    scanId: response.scan_id,
    ...(response.subject ? { subject: response.subject } : {}),
    ...(response.subjectKey ? { subjectKey: response.subjectKey } : {}),
    ...(response.effectiveDateTime ? { effectiveDateTime: response.effectiveDateTime } : {})
  });

  const observations: Observation[] = [];

  if (response.angle) {
    observations.push(...mapAngleListToFHIR(response.angle, context));
  }
  if (response.axis) {
    observations.push(...mapAxesListToFHIR(response.axis, context));
  }
  if (response.cross_section) {
    observations.push(...mapCrossSectionListToFHIR(response.cross_section, context));
  }
  if (response.distance) {
    observations.push(...mapDistanceListToFHIR(response.distance, context));
  }
  if (response.height) {
    observations.push(...mapHeightListToFHIR(response.height, context));
  }
  if (response.marker) {
    observations.push(...mapMarkerListToFHIR(response.marker, context));
  }
  if (response.properties) {
    observations.push(...mapPropertyListToFHIR(response.properties, context));
  }

  // A caller-supplied subject is a resource the caller owns; a minted one is not
  // resolvable unless the Patient travels with the bundle.
  const resources: FhirResource[] = response.subject
    ? [...observations]
    : [patientFor(context.subjectKey), ...observations];

  return buildBundle({
    connector: CONNECTOR,
    resources,
    timestamp: response.timestamp ?? new Date().toISOString(),
    bundleKey: `vitronic|${response.scan_id}`
  });
}

export interface BundleOptions {
  /** Used verbatim as `Observation.subject` on every resource (D1). */
  subject?: Reference;
}

export async function getFhirBundleFromBodyloopMeasurementData(
  client: BodyLoopClient,
  viatarId: string,
  scopes: Scope[],
  options: BundleOptions = {}
): Promise<VitronicBundleResult> {
  const errors: ConnectorError[] = [];

  // The viatar carries the two things the measurement payload does not: when the
  // scan happened and which proband it belongs to. Both were already being
  // fetched by `getViatar` and thrown away.
  let viatar: Viatar | undefined;
  try {
    viatar = await client.getViatar(viatarId);
  } catch (error) {
    errors.push(asConnectorError(error, 'GET viatar'));
  }

  const results = await client.getMeasurementsData(viatarId, scopes);
  const scopesData: Pick<VitronicMeasurementResponse, Scope> = {};
  for (const result of results) {
    if (result.error) {
      errors.push(result.error);
    } else {
      Object.assign(scopesData, { [result.scope]: result.data });
    }
  }

  const recordedAt = viatar?.meta?.crtime ?? viatar?.meta?.mtime;
  const effectiveDateTime = toFhirDateTime(recordedAt);
  const timestamp = toFhirInstant(recordedAt);
  const probandId = viatar?.proband_id;

  const bundle = buildBundleFromVitronicResponse({
    scan_id: viatarId,
    ...(options.subject ? { subject: options.subject } : {}),
    ...(probandId === null || probandId === undefined ? {} : { subjectKey: `proband/${probandId}` }),
    ...(effectiveDateTime ? { effectiveDateTime } : {}),
    ...(timestamp ? { timestamp } : {}),
    ...scopesData
  });

  const issues = toOperationOutcome(errors);
  return issues ? { bundle, issues } : { bundle };
}
