/**
 * WHAT: OuraReader, the IHealthDataReader adapter over getFhirBundleFromOuraData and TokenHandler: validates the reader config, bridges the host TokenStore to the token handler, and reads a window of the requested scopes as one bundle.
 * NOT:  Does not re-implement mapping, fetching or the token exchange, and persists nothing itself; tokens go through host.tokenStore (D8). Does not inject fetch into the provider: the provider still calls the global fetch (spec section 11).
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d8; DECISIONS.md#d1; DECISIONS.md#d6; DECISIONS.md#d7
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: a per-wearer tokenKey is required and there is no default, because several wearers can share one OAuth client and a shared key would hand one wearer the other's data. A window must carry an offset: Oura takes dates in the wearer's own offset, and a silent +00:00 shifts heart-rate windows.
 */
import {
  HealthDataReader,
  type Issue,
  type ReaderDescriptor,
  type ReaderInput,
  type ReaderMetadata,
  type ReadRequest,
  type ReadResult
} from '@open-twin/reader-core';
import type { OperationOutcomeIssue } from 'fhir/r4';
import { z } from 'zod';
import type { RequestParams } from './api/schemas/client';
import { SUPPORTED_SCOPES, type SupportedScope } from './config/constants';
import { buildBundleFromResponse } from './fhir/bundleBuilder';
import { CONNECTOR } from './fhir/mappers/shared';
import { TokenHandler } from './utils/tokenUtils';

/** The reader's own config schema; `OuraRingAppConfig` is a plain type (spec section 11). */
export const OuraReaderConfig = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    redirectUri: z.url(),
    scopes: z.array(z.enum(SUPPORTED_SCOPES)).optional(),
    /** Read Oura's public sandbox instead of the wearer's data. */
    sandbox: z.boolean().default(false)
  })
  .strict();

export type OuraReaderConfigInput = z.input<typeof OuraReaderConfig>;

/** Must equal the entry in registry/connectors.json; verify/check-registry.ts compares them. */
export const OURA_DESCRIPTOR: ReaderDescriptor = {
  id: CONNECTOR.connector,
  name: 'Oura Ring API v2',
  version: CONNECTOR.version,
  kind: 'api',
  domains: ['wearable'],
  dataTypes: [...SUPPORTED_SCOPES],
  auth: 'oauth2',
  vendorDocs: 'https://developer.ouraring.com/applications'
};

const OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

/** The window's own UTC offset, `Z` written as `+00:00`; undefined when it carries none. */
export function offsetOf(iso: string): string | undefined {
  const match = OFFSET.exec(iso);
  if (!match?.[1]) return undefined;
  return match[1] === 'Z' ? '+00:00' : match[1];
}

function toIssue(outcome: OperationOutcomeIssue): Issue {
  return {
    severity: outcome.severity === 'fatal' ? 'error' : outcome.severity,
    code: outcome.code,
    details: outcome.diagnostics ?? 'The vendor reported a problem with one requested type.'
  };
}

const isScope = (type: string): type is SupportedScope => (SUPPORTED_SCOPES as readonly string[]).includes(type);

export class OuraReader extends HealthDataReader {
  readonly descriptor: ReaderDescriptor = OURA_DESCRIPTOR;
  private config: z.infer<typeof OuraReaderConfig> | undefined;
  private tokens: TokenHandler | undefined;
  private tokenKey: string | undefined;

  protected override async onOpen(input: ReaderInput): Promise<void> {
    if (input.kind !== 'api' || input.sourceId !== this.descriptor.id) {
      throw this.fail('OuraReader needs an api input with sourceId "oura"', 'validation', 'open');
    }
    const parsed = OuraReaderConfig.safeParse(input.config);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ');
      throw this.fail(`The Oura reader config is invalid at: ${fields}`, 'validation', 'open');
    }
    if (!input.tokenKey) {
      throw this.fail('OuraReader needs a per-wearer tokenKey; there is no default', 'validation', 'open');
    }
    this.config = parsed.data;
    this.tokenKey = input.tokenKey;
    this.tokens = new TokenHandler(parsed.data, input.authorizationCode ?? '');

    const stored = await this.loadTokens(input.tokenKey);
    if (stored) {
      this.tokens.setTokens(
        {
          access_token: stored.accessToken,
          refresh_token: stored.refreshToken ?? '',
          expires_in: 0,
          token_type: 'bearer'
        },
        Date.parse(stored.expiresAt)
      );
    } else if (input.authorizationCode) {
      await this.tokens.authenticate();
    }
  }

  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: { id: this.descriptor.id, apiVersion: 'v2', endpoint: 'api.ouraring.com' },
      dataTypes: this.descriptor.dataTypes,
      capabilities: { incremental: false, sandbox: this.config?.sandbox ?? false, write: false }
    });
  }

  async read(request: ReadRequest): Promise<ReadResult> {
    this.requireOpen();
    const config = this.config;
    const tokens = this.tokens;
    if (!config || !tokens) throw this.fail('read called before open', 'validation', 'read');
    const issues: Issue[] = [];

    const requested = request.types ?? this.descriptor.dataTypes;
    const types = requested.filter(isScope);
    if (types.length < requested.length) {
      issues.push(this.issue('warning', 'unknown-type', 'A requested type is not an Oura scope and was ignored.'));
    }
    if (types.length === 0) throw this.fail('No requested type is an Oura scope', 'validation', 'read');

    const params: RequestParams = { types };
    if (request.window) {
      const offset = offsetOf(request.window.start);
      if (!offset) {
        throw this.fail(
          'The request window must carry a UTC offset; Oura takes dates in the wearer offset',
          'validation',
          'read'
        );
      }
      params.start_date = request.window.start.slice(0, 10);
      params.end_date = request.window.end.slice(0, 10);
      params.utc_offset = offset;
    }

    const timestamp = this.now();
    const result = await buildBundleFromResponse(params, tokens, {
      sandbox: config.sandbox,
      subject: request.subject,
      subjectKey: request.subjectKey,
      timestamp
    });
    issues.push(...(result.issues?.issue ?? []).map(toIssue));

    // The mappers tag the Bundle only; every resource carries the tag from here on.
    const bundle = this.withConnectorTag(result.bundle);
    return { bundle, issues, provenance: this.provenanceFor(bundle, (await this.describe()).source) };
  }

  protected override async onClose(): Promise<void> {
    const current = this.tokens?.getTokens();
    if (!current || !this.tokenKey) return;
    await this.saveTokens(this.tokenKey, {
      accessToken: current.tokens.access_token,
      refreshToken: current.tokens.refresh_token,
      expiresAt: new Date(current.expiresAt).toISOString()
    });
  }
}

export const createReader = (): OuraReader => new OuraReader();
