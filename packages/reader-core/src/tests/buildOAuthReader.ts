import { buildBundle } from '@open-twin/fhir-core';
import { OAuthReader, type OAuthTokenBridge } from '../oauthReader';
import type { ReaderDescriptor, ReaderMetadata, ReadResult } from '../types';
import type { Parser } from '../utils/parser';

type FakeConfig = { clientId: string; redirectUri: string };

const FakeConfigSchema: Parser<FakeConfig> = {
  safeParse: (data) => {
    const config = data as Partial<FakeConfig>;
    return config.clientId && config.redirectUri?.startsWith('https://')
      ? { success: true, data: { clientId: config.clientId, redirectUri: config.redirectUri } }
      : { success: false, error: { issues: [{ path: ['redirectUri'] }] } };
  }
};

/** An OAuth reader whose token handler is a plain object, counting code exchanges. */
export class FakeOAuthReader extends OAuthReader<FakeConfig> {
  readonly descriptor: ReaderDescriptor = {
    id: 'fake-oauth',
    name: 'Fake OAuth',
    version: '0.1.0',
    kind: 'api',
    domains: ['wearable'],
    dataTypes: [],
    auth: 'oauth2'
  };
  protected readonly configSchema = FakeConfigSchema;
  authenticated = 0;

  protected tokenHandlerFor(): OAuthTokenBridge {
    let held: { tokens: { access_token: string; refresh_token: string }; expiresAt: number } | undefined;

    return {
      setTokens: (tokens, expiresAt) => {
        held = { tokens, expiresAt: expiresAt ?? 0 };
      },
      getTokens: () => held,
      authenticate: () => {
        this.authenticated += 1;
        held = { tokens: { access_token: 'from-code', refresh_token: 'r' }, expiresAt: 1 };
        return Promise.resolve();
      }
    };
  }

  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: { id: 'fake-oauth' },
      dataTypes: [],
      capabilities: { incremental: false, sandbox: false, write: false }
    });
  }

  read(): Promise<ReadResult> {
    if (!this.tokens?.getTokens()) return Promise.reject(this.fail('no tokens', 'auth', 'read'));

    const bundle = buildBundle({ connector: this.connector, resources: [], timestamp: this.now(), bundleKey: 'k' });
    return Promise.resolve({ bundle, issues: [], provenance: this.provenanceFor(bundle) });
  }
}
