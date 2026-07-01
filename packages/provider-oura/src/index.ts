import type { Bundle } from 'fhir/r4';
import type { RequestParams } from './api/schemas/client';
import type { OuraPersonal } from './api/schemas/personal';
import { buildBundleFromResponse } from './fhir/bundleBuilder';
import { requestOuraData } from './utils/clientUtils';
import { inferOuraResponse } from './utils/objectUtils';
import type { SupportedSchemaName, SupportedSchemaTypes } from './utils/typeUtils';

// biome-ignore lint/performance/noBarrelFile: This file is the public entry point for the npm package.
export { getAccessToken, refreshAccessToken } from './api/client';

export async function getSandboxOuraData(
  request: RequestParams,
  bearerToken: string
): Promise<(SupportedSchemaTypes[SupportedSchemaName] | OuraPersonal)[]> {
  const data = await requestOuraData(request, bearerToken, true);
  const inferredData = data.map((item) => inferOuraResponse(item));
  return inferredData;
}

export async function getOuraData(
  request: RequestParams,
  bearerToken: string
): Promise<(SupportedSchemaTypes[SupportedSchemaName] | OuraPersonal)[]> {
  const data = await requestOuraData(request, bearerToken);
  const inferredData = data.map((item) => inferOuraResponse(item));
  return inferredData;
}

export async function getFhirBundleFromOuraData(
  request: RequestParams,
  bearerToken: string,
  sandbox: boolean = false
): Promise<Bundle> {
  return await buildBundleFromResponse(request, bearerToken, sandbox);
}
