import type { OuraRingAppConfig } from '../config/config';
import { errorResponseHandler } from '../utils/errorMessageHandler';
import { getOuraOauthTokenUrl } from './endpoints';
import { type TokenResponse, TokenResponseSchema } from './schemas/auth';

export function getAuthorizationUrl(config: OuraRingAppConfig): string {
  if (!config.clientId || !config.redirectUri) {
    throw new Error('Missing required OAuth parameters (client_id, or redirect_uri).');
  }

  const baseUrl = 'https://cloud.ouraring.com/oauth/authorize';
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: (config.scopes || []).join(' ')
  });

  return `${baseUrl}?${params.toString()}`;
}

export async function getAccessToken(code: string, config: OuraRingAppConfig): Promise<TokenResponse> {
  if (!config.clientId || !config.redirectUri) {
    throw new Error('Missing required OAuth parameters (client_id, or redirect_uri).');
  }

  const response = await fetch(getOuraOauthTokenUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: config.redirectUri
    }).toString()
  }).then((res) => res.json());

  const parseResult = TokenResponseSchema.safeParse(response);
  if (!parseResult.success) {
    throw new Error(`Failed to parse token response: ${errorResponseHandler(response)}`);
  }

  return parseResult.data;
}

export async function refreshAccessToken(refresh_token: string, config: OuraRingAppConfig): Promise<TokenResponse> {
  if (!config.clientId) {
    throw new Error('Missing required OAuth parameter: client_id.');
  }

  const response = await fetch(getOuraOauthTokenUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token
    }).toString()
  }).then((res) => res.json());

  const parseResult = TokenResponseSchema.safeParse(response);
  if (!parseResult.success) {
    throw new Error(`Failed to parse token response: ${errorResponseHandler(response)}`);
  }

  return parseResult.data;
}
