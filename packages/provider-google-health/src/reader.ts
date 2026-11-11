/**
 * WHAT: GoogleHealthReader, the IHealthDataReader adapter over the Google Health client, mappers and googleapis OAuth.
 * NOT:  Does not re-implement mapping, paging or the token exchange, and persists nothing itself; tokens go through host.tokenStore (D8). The cursor and the `fitbit` alias come in a follow-up.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d8; DECISIONS.md#d1; DECISIONS.md#d6; DECISIONS.md#d7
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: googleapis ignores the global fetch, so the reader hands host.fetch to the client; a test that only stubs globalThis.fetch reaches the network.
 */
import {
  type Issue,
  issueFromOperationOutcome,
  OAuthReader,
  type OAuthTokenBridge,
  type ReaderDescriptor,
  type ReaderMetadata,
  type ReadRequest,
  type ReadResult,
  withConnectorTag
} from '@open-twin/reader-core';
import { z } from 'zod';
import { GoogleHealthClient } from './api/client';
import { ALL_TYPES, type AllType } from './api/record_types';
import { SUPPORTED_SCOPES } from './config/constants';
import { CONNECTOR } from './fhir/mappers/shared';
import { getFhirBundleFromGoogleHealthData } from './sync';

const GoogleHealthReaderConfig = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    redirectUri: z.url(),
    scopes: z.array(z.enum(SUPPORTED_SCOPES)).optional(),
    /** IANA zone of the wearer's civil dates. Required: a silent UTC drops a local day (D7). */
    timeZone: z.string().min(1)
  })
  .strict();

type GoogleHealthReaderConfig = z.infer<typeof GoogleHealthReaderConfig>;

const SOURCE: ReaderMetadata['source'] = {
  id: CONNECTOR.connector,
  apiVersion: 'v4',
  endpoint: 'health.googleapis.com'
};

export const GOOGLE_HEALTH_DESCRIPTOR: ReaderDescriptor = {
  id: CONNECTOR.connector,
  name: 'Google Health API v4',
  version: CONNECTOR.version,
  kind: 'api',
  domains: ['wearable'],
  dataTypes: [...ALL_TYPES],
  auth: 'oauth2'
};

const isDataType = (type: string): type is AllType => (ALL_TYPES as readonly string[]).includes(type);

/** The googleapis OAuth client seen through the shape OAuthReader restores and saves. */
class GoogleHealthTokens implements OAuthTokenBridge {
  constructor(
    readonly client: GoogleHealthClient,
    private readonly authorizationCode: string
  ) {}

  setTokens(tokens: { access_token: string; refresh_token: string }, expiresAt?: number): void {
    this.client.restoreCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || undefined,
      expiry_date: expiresAt,
      token_type: 'Bearer'
    });
  }

  getTokens(): { tokens: { access_token: string; refresh_token?: string }; expiresAt: number } | undefined {
    const credentials = this.client.getCredentials();

    if (!credentials.access_token) return undefined;

    return {
      tokens: { access_token: credentials.access_token, refresh_token: credentials.refresh_token ?? undefined },
      expiresAt: credentials.expiry_date ?? 0
    };
  }

  async authenticate(): Promise<void> {
    await this.client.initialize(this.authorizationCode);
  }
}

export class GoogleHealthReader extends OAuthReader<GoogleHealthReaderConfig> {
  readonly descriptor: ReaderDescriptor = GOOGLE_HEALTH_DESCRIPTOR;
  protected readonly configSchema = GoogleHealthReaderConfig;

  protected tokenHandlerFor(config: GoogleHealthReaderConfig, authorizationCode: string): GoogleHealthTokens {
    return new GoogleHealthTokens(new GoogleHealthClient(config, { fetch: this.host.fetch }), authorizationCode);
  }

  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: SOURCE,
      dataTypes: this.descriptor.dataTypes,
      capabilities: { incremental: false, sandbox: false, write: false }
    });
  }

  async read(request: ReadRequest): Promise<ReadResult> {
    if (!this.config || !this.tokens) throw this.fail('read called before open', 'validation', 'read');

    const config = this.config;
    const { client } = this.tokens as GoogleHealthTokens;

    if (!request.window) throw this.fail('Google Health needs a request window', 'validation', 'read');

    const issues: Issue[] = [];
    const requested = request.types ?? this.descriptor.dataTypes;
    const types = requested.filter(isDataType);

    if (types.length < requested.length) {
      issues.push(
        this.issue('warning', 'unknown-type', 'A requested type is not a Google Health type and was ignored.')
      );
    }

    if (types.length === 0) throw this.fail('No requested type is a Google Health type', 'validation', 'read');

    const result = await getFhirBundleFromGoogleHealthData({
      client,
      types,
      start_date: request.window.start,
      end_date: request.window.end,
      timeZone: config.timeZone,
      subjectKey: request.subjectKey,
      subject: request.subject,
      timestamp: this.now()
    });
    issues.push(...(result.issues?.issue ?? []).map(issueFromOperationOutcome));

    if (result.unmapped.length > 0) {
      issues.push(this.issue('warning', 'unmapped-type', 'A declared type arrived and the mapper dropped it.'));
    }

    const bundle = withConnectorTag(result.bundle, this.connector);
    return { bundle, issues, provenance: this.provenanceFor(bundle, SOURCE) };
  }
}

export const createReader = (): GoogleHealthReader => new GoogleHealthReader();
