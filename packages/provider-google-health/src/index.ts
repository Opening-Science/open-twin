/**
 * WHAT: Package public barrel: re-exports the supported API surface.
 * NOT:  Must not contain mapping or clinical logic; implementation lives in sibling modules.
GOVERNED BY: DECISIONS.md#d9
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import type { Auth } from 'googleapis';
import { GoogleHealthClient } from './api/client';
import type { AllTypes } from './api/record_types';

export type { GoogleHealthClientOptions } from './api/client';
export type { AllType, QueryWindow } from './api/record_types';
export {
  ALL_TYPES,
  buildTypeFilter,
  DAILY_TYPES,
  INTERVAL_TYPES,
  resolveWindow,
  SAMPLE_TYPES,
  SESSION_TYPES
} from './api/record_types';
export type { BuildBundleOptions, BundleResult } from './fhir/bundleBuilder';
export { buildBundleFromResponses, mapDataPointToFHIR } from './fhir/bundleBuilder';
export { createReader, GoogleHealthReader } from './reader';
export type { GetDataTypesRequest, GetDataTypesResult, GetFhirBundleRequest, GetFhirBundleResult } from './sync';
export { getDataTypes, getFhirBundleFromGoogleHealthData } from './sync';
// biome-ignore lint/style/useExportType: Exposing the type and GoogleHealthClient class is necessary for external usage
export { AllTypes, GoogleHealthClient };

export function getGoogleHealthAuthUrl(client: GoogleHealthClient): string {
  return client.getAuthUrl();
}

export async function initializeGoogleHealthClient(
  client: GoogleHealthClient,
  code: string
): Promise<Auth.Credentials> {
  return await client.initialize(code);
}
