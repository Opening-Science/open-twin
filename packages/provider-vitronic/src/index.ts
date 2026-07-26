import { BodyLoopClient, type ScopeResult } from './api/client';
import type { ProbandRequest, ProbandResponse } from './api/schemas/proband';
import type { Viatar, ViatarList, ViatarRequest } from './api/schemas/viatars';
import type { BodyLoopClientConfig } from './config/config';
import type { Scope, Scopes } from './config/constants';
import {
  type BundleOptions,
  buildBundleFromVitronicResponse,
  getFhirBundleFromBodyloopMeasurementData,
  type VitronicBundleResult,
  type VitronicMeasurementResponse
} from './fhir/bundleBuilder';

export type {
  BodyLoopClientConfig,
  BundleOptions,
  Scope,
  ScopeResult,
  Scopes,
  VitronicBundleResult,
  VitronicMeasurementResponse
};
export { BodyLoopClient, buildBundleFromVitronicResponse };

export function createBodyLoopClient(config: BodyLoopClientConfig): BodyLoopClient {
  return new BodyLoopClient(config);
}

export async function getAvailableViatars(client: BodyLoopClient): Promise<ViatarList> {
  return await client.getAvailableViatars();
}

export async function getViatar(client: BodyLoopClient, viatarId: string): Promise<Viatar> {
  return await client.getViatar(viatarId);
}

/**
 * One result per requested scope. A scope that failed carries a `ConnectorError`
 * and leaves its siblings untouched (D6).
 */
export async function getMeasurementData<T extends Scope>(
  client: BodyLoopClient,
  viatarId: string,
  scopes: T[]
): Promise<ScopeResult<T>[]> {
  return await client.getMeasurementsData(viatarId, scopes);
}

export async function createProband(client: BodyLoopClient, proband: ProbandRequest): Promise<ProbandResponse> {
  return await client.createProband(proband);
}

export async function getProband(client: BodyLoopClient, probandId: number): Promise<ProbandResponse> {
  return await client.getProband(probandId);
}

export async function startScan(
  client: BodyLoopClient,
  viatarRequest: ViatarRequest,
  targetKind: string
): Promise<{ viatar_id: number }> {
  return await client.startScan(viatarRequest, targetKind);
}

/**
 * Builds the FHIR bundle for one scan.
 *
 * `subject` is optional and used verbatim: the connector does not know who the
 * patient is, and an integrator that does should be able to say so (D1). Without
 * one, a deterministic `urn:uuid:` subject is derived from the scan's proband id
 * and a matching Patient travels in the bundle.
 */
export async function getFhirBundleFromVitronicData(
  client: BodyLoopClient,
  viatarId: string,
  scopes: Scope[],
  options: BundleOptions = {}
): Promise<VitronicBundleResult> {
  return await getFhirBundleFromBodyloopMeasurementData(client, viatarId, scopes, options);
}
