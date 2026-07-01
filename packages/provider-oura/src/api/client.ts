import { CLIENT_ID, REDIRECT_URI } from '../config/constants';
import { getOuraOauthTokenUrl } from './endpoints';
import { type TokenResponse, TokenResponseSchema } from './schemas/auth';

export async function getAccessToken(code: string): Promise<TokenResponse> {
  if (!CLIENT_ID || !REDIRECT_URI) {
    throw new Error('Missing required OAuth parameters (client_id, or redirect_uri).');
  }

  const response = await fetch(getOuraOauthTokenUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI
    }).toString()
  }).then((res) => res.json());

  return TokenResponseSchema.parse(response);
}

export async function refreshAccessToken(refresh_token: string): Promise<TokenResponse> {
  if (!CLIENT_ID) {
    throw new Error('Missing required OAuth parameter: client_id.');
  }

  const response = await fetch(getOuraOauthTokenUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token
    }).toString()
  }).then((res) => res.json());

  return TokenResponseSchema.parse(response);
}
