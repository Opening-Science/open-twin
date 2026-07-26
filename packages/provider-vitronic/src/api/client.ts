import { Readable } from 'node:stream';
import { ConnectorError, fromHttpStatus, parseRetryAfter } from '@open-twin/fhir-core';
import type { BodyLoopClientConfig } from '../config/config';
import { ENDPOINTS, type Scope } from '../config/constants';
import { type ProbandRequest, type ProbandResponse, ProbandResponseSchema } from './schemas/proband';
import { MEASUREMENT_SCHEMAS, type MeasurementData, type Token, TokenSchema } from './schemas/shared';
import { type Viatar, type ViatarList, ViatarListSchema, type ViatarRequest, ViatarSchema } from './schemas/viatars';

const CONNECTOR = 'vitronic';

/**
 * Every failure below is a `ConnectorError` and none of them quotes the response.
 *
 * Raw bodies were previously interpolated into thrown messages at fourteen sites
 * in this file, three of which returned proband records — name, date of birth,
 * address, contact details. Those messages land in application logs, stack
 * traces, error reporters and CI output. The status, the operation and the error
 * class are what a caller can act on; the body is what makes it a compliance
 * problem.
 */
function httpError(response: Response, operation: string): ConnectorError {
  return fromHttpStatus(response.status, {
    connector: CONNECTOR,
    operation,
    retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After'), Date.now())
  });
}

function validationError(operation: string): ConnectorError {
  return new ConnectorError('The response did not match the expected schema', {
    code: 'validation',
    connector: CONNECTOR,
    operation
  });
}

/**
 * Normalises anything thrown beneath this client into the error taxonomy.
 *
 * The original error is deliberately not attached as `cause`: a `SyntaxError`
 * from `Response.json()` quotes the offending body in its own message, so
 * carrying it forward would reintroduce exactly the leak this replaces.
 */
export function asConnectorError(error: unknown, operation: string): ConnectorError {
  if (error instanceof ConnectorError) {
    return error;
  }
  return new ConnectorError('The request could not be completed', {
    code: 'transport',
    connector: CONNECTOR,
    operation
  });
}

/**
 * One requested scope's outcome. Decision D6: absence of data is not an
 * exception and one failing scope must not discard its siblings.
 */
export interface ScopeResult<T extends Scope> {
  scope: T;
  data?: MeasurementData<T>;
  error?: ConnectorError;
}

export class BodyLoopClient {
  private config: BodyLoopClientConfig;
  private token: Token | null = null;
  private tokenPromise: Promise<Token> | null = null;

  constructor(config: BodyLoopClientConfig) {
    this.config = config;
  }

  private async parseJson(response: Response, operation: string): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw validationError(operation);
    }
  }

  private async getAccessToken(): Promise<Token> {
    const operation = 'POST authentification/token';
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
      throw httpError(response, operation);
    }

    const parseResult = TokenSchema.safeParse(await this.parseJson(response, operation));
    if (!parseResult.success) {
      throw validationError(operation);
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
    const operation = 'GET viatars';
    const token = await this.getToken();
    const url = this.config.baseUrl + ENDPOINTS.VIATARS();
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      throw httpError(response, operation);
    }

    // Every other method safe-parses; this one used to check `Array.isArray` and
    // hand the contents back typed as `ViatarList` without validating them.
    const parseResult = ViatarListSchema.safeParse(await this.parseJson(response, operation));
    if (!parseResult.success) {
      throw validationError(operation);
    }

    return parseResult.data;
  }

  async getViatar(viatarId: string): Promise<Viatar> {
    const operation = 'GET viatar';
    const token = await this.getToken();
    const url = this.config.baseUrl + ENDPOINTS.VIATAR(viatarId);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      throw httpError(response, operation);
    }

    const parseResult = ViatarSchema.safeParse(await this.parseJson(response, operation));
    if (!parseResult.success) {
      throw validationError(operation);
    }

    return parseResult.data;
  }

  async getMeasurementData<T extends Scope>(viatarId: string, scope: T): Promise<MeasurementData<T>> {
    const operation = `GET ${scope}`;
    const token = await this.getToken();
    const endpointKey = scope.toUpperCase() as keyof typeof ENDPOINTS;
    const url = this.config.baseUrl + ENDPOINTS[endpointKey](viatarId);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      throw httpError(response, operation);
    }

    const parseResult = MEASUREMENT_SCHEMAS[scope].safeParse(await this.parseJson(response, operation));

    if (!parseResult.success) {
      throw validationError(operation);
    }

    return parseResult.data as MeasurementData<T>;
  }

  /**
   * Fans out over the requested scopes. `Promise.allSettled`, not `Promise.all`:
   * one rate-limited scope used to discard every sibling result that had already
   * arrived.
   */
  async getMeasurementsData<T extends Scope>(viatarId: string, scopes: T[]): Promise<ScopeResult<T>[]> {
    const settled = await Promise.allSettled(scopes.map((scope) => this.getMeasurementData(viatarId, scope)));

    return settled.map((result, index) => {
      const scope = scopes[index] as T;
      return result.status === 'fulfilled'
        ? { scope, data: result.value }
        : { scope, error: asConnectorError(result.reason, `GET ${scope}`) };
    });
  }

  async getModelStream(viatarId: string, modelName: string): Promise<Readable> {
    const operation = 'GET model';
    const token = await this.getToken();

    const url = this.config.baseUrl + ENDPOINTS.MODEL(viatarId, modelName);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      throw httpError(response, operation);
    }

    if (!response.body) {
      throw new ConnectorError('The response carried no body', {
        code: 'transport',
        connector: CONNECTOR,
        operation
      });
    }

    return Readable.from(response.body);
  }

  async createProband(proband: ProbandRequest): Promise<ProbandResponse> {
    const operation = 'POST probands';
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
      throw httpError(response, operation);
    }

    const parseResult = ProbandResponseSchema.safeParse(await this.parseJson(response, operation));

    if (!parseResult.success) {
      throw validationError(operation);
    }

    return parseResult.data;
  }

  async getProband(probandId: number): Promise<ProbandResponse> {
    const operation = 'GET proband';
    const token = await this.getToken();
    const url = this.config.baseUrl + ENDPOINTS.PROBANDS() + probandId;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      throw httpError(response, operation);
    }

    const parseResult = ProbandResponseSchema.safeParse(await this.parseJson(response, operation));

    if (!parseResult.success) {
      throw validationError(operation);
    }

    return parseResult.data;
  }

  async startScan(viatarRequest: ViatarRequest, target_kind: string): Promise<{ viatar_id: number }> {
    const operation = 'POST viatars';
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
      throw httpError(response, operation);
    }
    const responseJson = (await this.parseJson(response, operation)) as { viatar_id?: unknown };

    if (typeof responseJson?.viatar_id !== 'number') {
      throw validationError(operation);
    }
    const viatarId = responseJson.viatar_id;

    const scanStartResult = await fetch(this.config.baseUrl + ENDPOINTS.VIATAR_START(String(viatarId)), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ target_kind })
    });

    if (!scanStartResult.ok) {
      throw httpError(scanStartResult, 'POST viatar targets');
    }

    return { viatar_id: viatarId };
  }
}
