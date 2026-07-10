import type { Bundle } from 'fhir/r4';
import { Auth, type health_v4 } from 'googleapis';
import type { GoogleHealthClient } from './api/client';
import type { AllTypes } from './api/record_types';
import { buildBundleFromResponses } from './fhir/bundleBuilder';

export function getGoogleHealthAuthUrl(client: GoogleHealthClient): string {
  return client.getAuthUrl();
}

export async function initializeGoogleHealthClient(client: GoogleHealthClient, code: string): Promise<void> {
  await client.initialize(code);
}

export async function getDataTypes({
  client,
  types,
  start_date,
  end_date
}: {
  client: GoogleHealthClient;
  types: AllTypes;
  start_date?: string;
  end_date?: string;
}): Promise<health_v4.Schema$ListDataPointsResponse[]> {
  const auth = client.getClient().context._options.auth;

  if (!auth || !(auth instanceof Auth.OAuth2Client)) {
    throw new Error('OAuth2Client is required for authentication.');
  }
  if (!auth?.getAccessToken()) {
    throw new Error(
      'Access token is required. Please authenticate the client first using initializeGoogleHealthClient.'
    );
  }

  return await client.getTypes({ types, start_date, end_date });
}

export async function getFhirBundleFromGoogleHealthData({
  client,
  types,
  start_date,
  end_date
}: {
  client: GoogleHealthClient;
  types: AllTypes;
  start_date?: string;
  end_date?: string;
}): Promise<Bundle> {
  const responses = await getDataTypes({ client, types, start_date, end_date });
  return buildBundleFromResponses(responses);
}
