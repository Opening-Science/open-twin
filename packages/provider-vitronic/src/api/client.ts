import type { BodyLoopClientConfig } from '../config/config';
import { ENDPOINTS, type Scopes } from '../config/constants';
import { type CommonType, type Token, TokenSchema } from './schemas/shared';

export class BodyLoopClient {
  private config: BodyLoopClientConfig;
  private token: Token | null = null;
  constructor(config: BodyLoopClientConfig) {
    this.config = config;
  }

  private async getAccessToken(): Promise<Token> {
    const response = await fetch(this.config.baseUrl + ENDPOINTS.AUTH(), {
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

  async getMeasurementData(viatarId: string, scopes: Scopes): Promise<CommonType[]> {
    if (scopes.length === 0) {
      throw new Error('No scopes provided for measurement data request.');
    }

    const token = await this.getToken();

    const responses = await Promise.all(
      scopes.map((scope) => {
        const endpointKey = scope.toUpperCase() as keyof typeof ENDPOINTS;

        return fetch(this.config.baseUrl + ENDPOINTS[endpointKey](viatarId), {
          headers: {
            Authorization: `Bearer ${token.access_token}`
          }
        });
      })
    );

    responses.forEach((response) => {
      if (!response.ok) {
        throw new Error(`Failed to get measurement data: ${response.statusText}`);
      }
    });

    const data = await Promise.all(responses.map((response) => response.json()));
    return data.flat();
  }
}
