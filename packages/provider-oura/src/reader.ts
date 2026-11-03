/**
 * WHAT: OuraReader, the IHealthDataReader adapter over the Oura fetch, mappers and TokenHandler.
 * NOT:  Does not re-implement mapping, fetching or the token exchange, and persists nothing itself; tokens go through host.tokenStore (D8). Does not inject fetch: the provider calls the global fetch (spec section 11).
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d8; DECISIONS.md#d1; DECISIONS.md#d6; DECISIONS.md#d7
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Oura takes dates in the wearer's own offset, so a window must carry one offset on both ends; a silent +00:00 shifts heart-rate windows.
 */
import {
  issueFromOutcome,
  OAuthReader,
  type ReaderDescriptor,
  type ReaderMetadata,
  type ReadRequest,
  type ReadResult
} from '@open-twin/reader-core';
import { z } from 'zod';
import type { RequestParams } from './api/schemas/client';
import { SUPPORTED_SCOPES, type SupportedScope } from './config/constants';
import { buildBundleFromResponse } from './fhir/bundleBuilder';
import { CONNECTOR } from './fhir/mappers/shared';
import { TokenHandler } from './utils/tokenUtils';

const OuraReaderConfig = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    redirectUri: z.url(),
    scopes: z.array(z.enum(SUPPORTED_SCOPES)).optional(),
    /** Read Oura's public sandbox instead of the wearer's data. */
    sandbox: z.boolean().default(false)
  })
  .strict();

const SOURCE: ReaderMetadata['source'] = { id: CONNECTOR.connector, apiVersion: 'v2', endpoint: 'api.ouraring.com' };

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

/** The window's UTC offset, `Z` as `+00:00`; undefined when it carries none. */
function offsetOf(iso: string): string | undefined {
  const match = /(Z|[+-]\d{2}:\d{2})$/.exec(iso)?.[1];
  return match === 'Z' ? '+00:00' : match;
}

const isScope = (type: string): type is SupportedScope => (SUPPORTED_SCOPES as readonly string[]).includes(type);

export class OuraReader extends OAuthReader<z.infer<typeof OuraReaderConfig>> {
  readonly descriptor: ReaderDescriptor = OURA_DESCRIPTOR;
  protected readonly configSchema = OuraReaderConfig;

  protected tokenHandlerFor(config: z.infer<typeof OuraReaderConfig>, authorizationCode: string): TokenHandler {
    return new TokenHandler(config, authorizationCode);
  }

  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: SOURCE,
      dataTypes: this.descriptor.dataTypes,
      capabilities: { incremental: false, sandbox: this.config?.sandbox ?? false, write: false }
    });
  }

  async read(request: ReadRequest): Promise<ReadResult> {
    const config = this.opened(this.config);
    const tokens = this.opened(this.tokens) as TokenHandler;
    const issues = [];

    const requested = request.types ?? this.descriptor.dataTypes;
    const types = requested.filter(isScope);
    if (types.length < requested.length) {
      issues.push(this.issue('warning', 'unknown-type', 'A requested type is not an Oura scope and was ignored.'));
    }
    if (types.length === 0) throw this.fail('No requested type is an Oura scope', 'validation', 'read');

    const params: RequestParams = { types };
    if (request.window) {
      const offset = offsetOf(request.window.start);
      if (!offset || offset !== offsetOf(request.window.end)) {
        throw this.fail(
          'The window must carry one UTC offset on both ends; Oura takes dates in the wearer offset',
          'validation',
          'read'
        );
      }
      params.start_date = request.window.start.slice(0, 10);
      params.end_date = request.window.end.slice(0, 10);
      params.utc_offset = offset;
    }

    const result = await buildBundleFromResponse(params, tokens, {
      sandbox: config.sandbox,
      subject: request.subject,
      subjectKey: request.subjectKey,
      timestamp: this.now()
    });
    issues.push(...(result.issues?.issue ?? []).map(issueFromOutcome));
    const bundle = this.withConnectorTag(result.bundle);
    return { bundle, issues, provenance: this.provenanceFor(bundle, SOURCE) };
  }
}

export const createReader = (): OuraReader => new OuraReader();
