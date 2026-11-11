/**
 * WHAT: WhoopReader, the IHealthDataReader adapter over the WHOOP fetch, mappers and TokenHandler.
 * NOT:  Does not re-implement mapping, fetching or the token exchange, and persists nothing itself; tokens go through host.tokenStore (D8). Does not inject fetch: the provider calls the global fetch (spec section 11).
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d8; DECISIONS.md#d1; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: WHOOP has no type parameter; every read fetches recovery, cycle and sleep, and a narrower request is reported, not applied.
 */
import {
  type Issue,
  issueFromOperationOutcome,
  OAuthReader,
  type ReaderDescriptor,
  type ReaderMetadata,
  type ReadRequest,
  type ReadResult,
  withConnectorTag
} from '@open-twin/reader-core';
import { z } from 'zod';
import { WHOOP_SCOPES } from './api/client';
import { getFhirBundleFromWhoopData } from './fhir/bundleBuilder';
import { CONNECTOR } from './fhir/mappers/shared';
import { TokenHandler } from './utils/tokenUtils';

const WhoopReaderConfig = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    redirectUri: z.url(),
    scopes: z.array(z.enum(WHOOP_SCOPES)).optional()
  })
  .strict();

const DATA_TYPES = ['recovery', 'cycle', 'sleep'] as const;
const SOURCE: ReaderMetadata['source'] = { id: CONNECTOR.connector, apiVersion: 'v2', endpoint: 'api.prod.whoop.com' };

export const WHOOP_DESCRIPTOR: ReaderDescriptor = {
  id: CONNECTOR.connector,
  name: 'WHOOP Developer API v2',
  version: CONNECTOR.version,
  kind: 'api',
  domains: ['wearable'],
  dataTypes: [...DATA_TYPES],
  auth: 'oauth2',
  vendorDocs: 'https://developer.whoop.com/'
};

export class WhoopReader extends OAuthReader<z.infer<typeof WhoopReaderConfig>> {
  readonly descriptor: ReaderDescriptor = WHOOP_DESCRIPTOR;
  protected readonly configSchema = WhoopReaderConfig;

  protected tokenHandlerFor(config: z.infer<typeof WhoopReaderConfig>, authorizationCode: string): TokenHandler {
    return new TokenHandler(config, authorizationCode);
  }

  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: SOURCE,
      dataTypes: this.descriptor.dataTypes,
      capabilities: { incremental: false, sandbox: false, write: false }
    });
  }

  async read(request: ReadRequest): Promise<ReadResult> {
    if (!this.tokens) throw this.fail('read called before open', 'validation', 'read');

    const tokens = this.tokens as TokenHandler;
    if (!request.window) throw this.fail('WHOOP needs a request window', 'validation', 'read');
    const issues: Issue[] = [];
    if (request.types) {
      const known = request.types.filter((type) => (DATA_TYPES as readonly string[]).includes(type));
      if (known.length < request.types.length) {
        issues.push(this.issue('warning', 'unknown-type', 'A requested type is not a WHOOP type and was ignored.'));
      }
      if (known.length < DATA_TYPES.length) {
        issues.push(
          this.issue(
            'information',
            'types-not-applied',
            'WHOOP serves recovery, cycle and sleep together; all three were read.'
          )
        );
      }
    }

    const result = await getFhirBundleFromWhoopData(request.window, tokens, {
      subject: request.subject,
      subjectKey: request.subjectKey,
      timestamp: this.now()
    });
    issues.push(...(result.issues?.issue ?? []).map(issueFromOperationOutcome));
    const bundle = withConnectorTag(result.bundle, this.connector);
    return { bundle, issues, provenance: this.provenanceFor(bundle, SOURCE) };
  }
}

export const createReader = (): WhoopReader => new WhoopReader();
