import { Readable } from 'node:stream';
import type { BodyLoopClientConfig } from '../config/config';
import { ENDPOINTS, type Scope } from '../config/constants';
import { type ProbandRequest, type ProbandResponse, ProbandResponseSchema } from './schemas/proband';
import { MEASUREMENT_SCHEMAS, type MeasurementData, type Token, TokenSchema } from './schemas/shared';
import type { ViatarList, ViatarRequest } from './schemas/viatars';

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

  async createProband(proband: ProbandRequest): Promise<ProbandResponse> {
    const token = await this.getToken();
    const url = this.config.baseUrl + ENDPOINTS.PROBANDS();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(proband)
    });

    if (!response.ok) {
      throw new Error(`Failed to create proband: ${response.statusText} - ${await response.text()}`);
    }

    const data = await response.json();
    const parseResult = ProbandResponseSchema.safeParse(data);

    if (!parseResult.success) {
      throw new Error(`Failed to parse proband response: ${JSON.stringify(data)}`);
    }

    return parseResult.data;
  }

  async getProband(probandId: number): Promise<ProbandResponse> {
    const token = await this.getToken();
    const url = this.config.baseUrl + ENDPOINTS.PROBANDS() + probandId;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get proband: ${response.statusText} - ${await response.text()}`);
    }

    const data = await response.json();
    const parseResult = ProbandResponseSchema.safeParse(data);

    if (!parseResult.success) {
      throw new Error(`Failed to parse proband response: ${JSON.stringify(data)}`);
    }

    return parseResult.data;
  }

  async startScan(viatarRequest: ViatarRequest, target_kind: string): Promise<{ viatar_id: number }> {
    const token = await this.getToken();
    const url = this.config.baseUrl + ENDPOINTS.VIATARS();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(viatarRequest)
    });

    if (!response.ok) {
      throw new Error(`Failed to create viatar for scan: ${response.statusText} - ${await response.text()}`);
    }
    const responseJson = await response.json();

    if (!responseJson?.viatar_id) {
      throw new Error(`Invalid response from create viatar: ${JSON.stringify(responseJson)}`);
    }
    const viatarId = responseJson.viatar_id;

    const scanStartResult = await fetch(this.config.baseUrl + ENDPOINTS.VIATAR_START(viatarId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ target_kind })
    });

    if (!scanStartResult.ok) {
      throw new Error(
        `Failed to start scan for viatarId ${viatarId}: ${scanStartResult.statusText} - ${await scanStartResult.text()}`
      );
    }

    return { viatar_id: viatarId };
  }
}
