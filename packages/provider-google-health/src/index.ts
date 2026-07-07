import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Bundle } from 'fhir/r4';
import type { Auth, health_v4 } from 'googleapis';
import { GoogleHealthClient } from './api/client';
import type { AllTypes } from './api/record_types';
import { buildBundleFromResponses } from './fhir/bundleBuilder';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const googleHealthClient = new GoogleHealthClient();

export function getGoogleHealthAuthUrl(): string {
  return googleHealthClient.getAuthUrl();
}

export async function initializeGoogleHealthClient(code: string): Promise<Auth.Credentials> {
  return await googleHealthClient.initialize(code);
}

export async function getDataTypes({
  types,
  start_date,
  end_date
}: {
  types: AllTypes;
  start_date?: string;
  end_date?: string;
}): Promise<health_v4.Schema$ListDataPointsResponse[]> {
  const access_token = process.env.ACCESS_TOKEN;
  const refresh_token = process.env.REFRESH_TOKEN;
  if (!access_token || !refresh_token) {
    throw new Error(
      'Access token and refresh token are required. Please set ACCESS_TOKEN and REFRESH_TOKEN environment variables.'
    );
  }
  const credentials: Auth.Credentials = {
    access_token: access_token,
    refresh_token: refresh_token
  };
  googleHealthClient.authenticate(credentials);
  return await googleHealthClient.getTypes({ types, start_date, end_date });
}

export async function getFhirBundleFromGoogleHealthData({
  types,
  start_date,
  end_date
}: {
  types: AllTypes;
  start_date?: string;
  end_date?: string;
}): Promise<Bundle> {
  const responses = await getDataTypes({ types, start_date, end_date });
  return buildBundleFromResponses(responses);
}
