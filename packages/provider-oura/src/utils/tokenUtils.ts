import { getAccessToken, refreshAccessToken } from '../api/client';
import type { TokenResponse } from '../api/schemas/auth';
import type { OuraRingAppConfig } from '../config/config';

export class TokenHandler {
  private tokenContainer: TokenResponse | null = null;
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
    try {
      const tokenResponse: TokenResponse = await getAccessToken(this.authToken, this.config);
      this.setTokens(tokenResponse);
    } catch (error) {
      throw new Error(`Failed to authenticate with Oura API: ${error}`);
    }
  }

  async getAccessToken(): Promise<string> {
    if (this.tokenContainer && this.expiresAt && Date.now() < this.expiresAt) {
      return this.tokenContainer.access_token;
    }

    if (this.tokenContainer?.refresh_token) {
      try {
        const tokenResponse: TokenResponse = await refreshAccessToken(this.tokenContainer.refresh_token, this.config);
        this.setTokens(tokenResponse);
        return this.tokenContainer.access_token;
      } catch (error) {
        throw new Error(`Failed to refresh access token: ${error}`);
      }
    }

    throw new Error('No access token or refresh token available. Please authenticate first.');
  }

  setTokens(tokenResponse: TokenResponse): void {
    this.tokenContainer = tokenResponse;

    this.expiresAt = Date.now() + tokenResponse.expires_in * 1000;
  }
}
