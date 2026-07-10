import type { Bundle } from 'fhir/r4';
import type { RequestParams } from './api/schemas/client';
import type { OuraPersonal } from './api/schemas/personal';
import { buildBundleFromResponse } from './fhir/bundleBuilder';
import { requestOuraData } from './utils/clientUtils';
import { inferOuraResponse } from './utils/objectUtils';
import type { TokenHandler } from './utils/tokenUtils';
import type { SupportedSchemaName, SupportedSchemaTypes } from './utils/typeUtils';

// biome-ignore lint/performance/noBarrelFile: This file is the public entry point for the npm package.
export { OuraRingAppConfig } from './config/config';
export { TokenHandler } from './utils/tokenUtils';

export async function getSandboxOuraData(
  request: RequestParams,
  tokenHandler: TokenHandler
): Promise<(SupportedSchemaTypes[SupportedSchemaName] | OuraPersonal | undefined)[]> {
  const data = await requestOuraData(request, tokenHandler, true);
  const inferredData = data.map((item) => inferOuraResponse(item));
  return inferredData;
}

export async function getOuraData(
  request: RequestParams,
  tokenHandler: TokenHandler
): Promise<(SupportedSchemaTypes[SupportedSchemaName] | OuraPersonal | undefined)[]> {
  const data = await requestOuraData(request, tokenHandler);
  const inferredData = data.map((item) => inferOuraResponse(item));
  return inferredData;
}

export async function getFhirBundleFromOuraData(
  request: RequestParams,
  tokenHandler: TokenHandler,
  sandbox: boolean = false
): Promise<Bundle | undefined> {
  return await buildBundleFromResponse(request, tokenHandler, sandbox);
}
