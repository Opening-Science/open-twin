import type { BodyLoopClientConfig } from '../config/config';
import type { CommonType } from './schemas/common';
import { type Token, TokenSchema } from './schemas/token';

export class BodyLoopClient {
  private config: BodyLoopClientConfig;
  private token: Token | null = null;
  constructor(config: BodyLoopClientConfig) {
    this.config = config;
  }

  private async getAccessToken(): Promise<Token> {
    const response = await fetch('https://api.bodyloop.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: this.config.username,
        password: this.config.password,
        scope: this.config.scope
      }).toString()
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data = await response.json();
    const parseResult = TokenSchema.safeParse(data);
    if (!parseResult.success) {
      throw new Error(`Failed to parse token response: ${JSON.stringify(data)}`);
    }

    this.token = parseResult.data;
    return this.token;
  }

  async getToken(): Promise<Token> {
    if (this.token && this.token.expires_at.getTime() > Date.now()) {
      return this.token;
    }
    return await this.getAccessToken();
  }

  async getMeasurementData(): Promise<CommonType[]> {
    const token = await this.getToken();
    const response = await fetch(`${this.config.baseUrl}/measurements`, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get measurement data: ${response.statusText}`);
    }

    return await response.json();
  }
}
