import type { Auth, health_v4 } from 'googleapis';
import { GoogleHealthClient } from './api/client';

const googleHealthClient = new GoogleHealthClient();

export function getGoogleHealthAuthUrl(): string {
  return googleHealthClient.getAuthUrl();
}

export async function initializeGoogleHealthClient(code: string): Promise<Auth.Credentials> {
  return await googleHealthClient.initialize(code);
}

export function getHealthTypes(): health_v4.Resource$Users$Datatypes {
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

  return googleHealthClient.getHealthDataSources();
}

export async function getSleepData(): Promise<health_v4.Schema$Sleep[]> {
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
  return await googleHealthClient.getSleepData();
}

export async function getActivityData(): Promise<health_v4.Schema$Exercise[]> {
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
  return await googleHealthClient.getActivityData();
}
