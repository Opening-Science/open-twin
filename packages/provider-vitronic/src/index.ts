import type { Bundle } from 'fhir/r4';
import { BodyLoopClient } from './api/client';
import type { ProbandRequest, ProbandResponse } from './api/schemas/proband';
import type { MeasurementData } from './api/schemas/shared';
import type { Viatar, ViatarList, ViatarRequest } from './api/schemas/viatars';
import type { BodyLoopClientConfig } from './config/config';
import type { Scope, Scopes } from './config/constants';
import { buildBundleFromVitronicResponse, getFhirBundleFromBodyloopMeasurementData } from './fhir/bundleBuilder';

export type { BodyLoopClientConfig, Scope, Scopes };
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

export async function getMeasurementData<T extends Scope>(
  client: BodyLoopClient,
  viatarId: string,
  scopes: T[]
): Promise<MeasurementData<T>[]> {
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

export async function getFhirBundleFromVitronicData(
  client: BodyLoopClient,
  viatarId: string,
  scopes: Scope[]
): Promise<Bundle> {
  return await getFhirBundleFromBodyloopMeasurementData(client, viatarId, scopes);
}
