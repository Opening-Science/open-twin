import { Readable } from 'node:stream';
import type { BodyLoopClientConfig } from '../config/config';
import { ENDPOINTS, type Scope } from '../config/constants';
import { MEASUREMENT_SCHEMAS, type MeasurementData, type Token, TokenSchema } from './schemas/shared';
import type { ViatarList } from './schemas/viatars';

export class BodyLoopClient {
  private config: BodyLoopClientConfig;
  private token: Token | null = null;
  private tokenPromise: Promise<Token> | null = null;

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
    if (!this.tokenPromise) {
      this.tokenPromise = this.getAccessToken().finally(() => {
        this.tokenPromise = null;
      });
    }

    return await this.tokenPromise;
  }

  async getAvailableViatars(): Promise<ViatarList> {
    const token = await this.getToken();
    const url = this.config.baseUrl + ENDPOINTS.VIATARS();
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get available viatars: ${response.statusText} - ${await response.text()}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`Expected an array of viatar IDs, but got: ${JSON.stringify(data)}`);
    }

    return data;
  }

  async getMeasurementData<T extends Scope>(viatarId: string, scope: T): Promise<MeasurementData<T>> {
    const token = await this.getToken();
    const endpointKey = scope.toUpperCase() as keyof typeof ENDPOINTS;
    const url = this.config.baseUrl + ENDPOINTS[endpointKey](viatarId);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get measurement data for ${scope}: ${response.statusText} - ${await response.text()}`);
    }

    const rawData = await response.json();

    const parseResult = MEASUREMENT_SCHEMAS[scope].safeParse(rawData);

    if (!parseResult.success) {
      throw new Error(
        `Data validation failed for scope '${scope}' with data: ${JSON.stringify(rawData)}. Errors: ${JSON.stringify(parseResult.error)}`
      );
    }

    return parseResult.data as MeasurementData<T>;
  }

  getMeasurementsData<T extends Scope>(viatarId: string, scopes: T[]): Promise<MeasurementData<T>[]> {
    return Promise.all(scopes.map((scope) => this.getMeasurementData(viatarId, scope)));
  }

  async getModelStream(viatarId: string, modelName: string): Promise<Readable> {
    const token = await this.getToken();

    const url = this.config.baseUrl + ENDPOINTS.MODEL(viatarId, modelName);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get model for viatarId ${viatarId}: ${response.statusText} - ${await response.text()}`
      );
    }

    if (!response.body) {
      throw new Error(`Response body is empty for viatarId ${viatarId}`);
    }

    return Readable.from(response.body);
  }
}
