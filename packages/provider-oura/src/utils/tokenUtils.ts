import { getAccessToken, refreshAccessToken } from '../api/client';
import type { TokenResponse } from '../api/schemas/auth';
import type { OuraRingAppConfig } from '../config/config';

export class TokenHandler {
  private tokenResponse: TokenResponse | null = null;
  private expiresAt: number | null = null;
  private config: OuraRingAppConfig;
  private authToken: string;

  constructor(config: OuraRingAppConfig, authorizationToken: string) {
    this.config = config;
    this.authToken = authorizationToken;
  }

  async authenticate(): Promise<void> {
    if (!this.authToken) {
      throw new Error('No auth token provided. Please provide an auth token to authenticate.');
    }

    const tokenResponse: TokenResponse = await getAccessToken(this.authToken, this.config);
    this.setTokens(tokenResponse);
  }

  async getAccessToken(): Promise<string> {
    if (this.tokenResponse && this.expiresAt && Date.now() < this.expiresAt) {
      return this.tokenResponse.access_token;
    }

    if (this.tokenResponse?.refresh_token) {
      const tokenResponse: TokenResponse = await refreshAccessToken(this.tokenResponse.refresh_token, this.config);
      this.setTokens(tokenResponse);
      return this.tokenResponse.access_token;
    }

    throw new Error('No access token or refresh token available. Please authenticate first.');
  }

  setTokens(tokenResponse: TokenResponse): void {
    this.tokenResponse = tokenResponse;

    this.expiresAt = Date.now() + tokenResponse.expires_in * 1000;
  }
}
