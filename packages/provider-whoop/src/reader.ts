/**
 * WHAT: WhoopReader, the IHealthDataReader adapter over getFhirBundleFromWhoopData and TokenHandler: validates the reader config, bridges the host TokenStore to the token handler, and reads one window of recovery, cycle and sleep as one bundle.
 * NOT:  Does not re-implement mapping, fetching or the token exchange, and persists nothing itself; tokens go through host.tokenStore (D8). Does not inject fetch: the provider still calls the global fetch (spec section 11).
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d8; DECISIONS.md#d1; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: WHOOP has no type parameter; every read fetches all three types, and a narrower request is reported, not applied. A per-wearer tokenKey is required with no default, because wearers can share one OAuth client.
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
import { WHOOP_SCOPES } from './api/client';
import { getFhirBundleFromWhoopData } from './fhir/bundleBuilder';
import { CONNECTOR } from './fhir/mappers/shared';
import { TokenHandler } from './utils/tokenUtils';

/** The reader's own config schema; `WhoopAppConfig` is a plain type (spec section 11). */
export const WhoopReaderConfig = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    redirectUri: z.url(),
    scopes: z.array(z.enum(WHOOP_SCOPES)).optional()
  })
  .strict();

export type WhoopReaderConfigInput = z.input<typeof WhoopReaderConfig>;

export const WHOOP_DATA_TYPES = ['recovery', 'cycle', 'sleep'] as const;

/** Must equal the entry in registry/connectors.json; verify/check-registry.ts compares them. */
export const WHOOP_DESCRIPTOR: ReaderDescriptor = {
  id: CONNECTOR.connector,
  name: 'WHOOP Developer API v2',
  version: CONNECTOR.version,
  kind: 'api',
  domains: ['wearable'],
  dataTypes: [...WHOOP_DATA_TYPES],
  auth: 'oauth2',
  vendorDocs: 'https://developer.whoop.com/'
};

function toIssue(outcome: OperationOutcomeIssue): Issue {
  return {
    severity: outcome.severity === 'fatal' ? 'error' : outcome.severity,
    code: outcome.code,
    details: outcome.diagnostics ?? 'The vendor reported a problem with one requested type.'
  };
}

export class WhoopReader extends HealthDataReader {
  readonly descriptor: ReaderDescriptor = WHOOP_DESCRIPTOR;
  private tokens: TokenHandler | undefined;
  private tokenKey: string | undefined;

  protected override async onOpen(input: ReaderInput): Promise<void> {
    if (input.kind !== 'api' || input.sourceId !== this.descriptor.id) {
      throw this.fail('WhoopReader needs an api input with sourceId "whoop"', 'validation', 'open');
    }
    const parsed = WhoopReaderConfig.safeParse(input.config);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ');
      throw this.fail(`The WHOOP reader config is invalid at: ${fields}`, 'validation', 'open');
    }
    if (!input.tokenKey) {
      throw this.fail('WhoopReader needs a per-wearer tokenKey; there is no default', 'validation', 'open');
    }
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
      source: { id: this.descriptor.id, apiVersion: 'v2', endpoint: 'api.prod.whoop.com' },
      dataTypes: this.descriptor.dataTypes,
      capabilities: { incremental: false, sandbox: false, write: false }
    });
  }

  async read(request: ReadRequest): Promise<ReadResult> {
    this.requireOpen();
    const tokens = this.tokens;
    if (!tokens) throw this.fail('read called before open', 'validation', 'read');
    if (!request.window) throw this.fail('WHOOP needs a request window', 'validation', 'read');
    const issues: Issue[] = [];

    if (request.types) {
      const known = request.types.filter((type) => (WHOOP_DATA_TYPES as readonly string[]).includes(type));
      if (known.length < request.types.length) {
        issues.push(this.issue('warning', 'unknown-type', 'A requested type is not a WHOOP type and was ignored.'));
      }
      if (known.length < WHOOP_DATA_TYPES.length) {
        issues.push(
          this.issue(
            'information',
            'types-not-applied',
            'WHOOP serves recovery, cycle and sleep together; all three were read.'
          )
        );
      }
    }

    const timestamp = this.now();
    const result = await getFhirBundleFromWhoopData(request.window, tokens, {
      subject: request.subject,
      subjectKey: request.subjectKey,
      timestamp
    });
    issues.push(...(result.issues?.issue ?? []).map(toIssue));

    // The mappers tag the Bundle only; every resource carries the tag from here on (#238).
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

export const createReader = (): WhoopReader => new WhoopReader();
