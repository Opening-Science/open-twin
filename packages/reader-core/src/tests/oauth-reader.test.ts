import { describe, expect, it } from 'vitest';
import { OAuthReader } from '../base';
import { describeTokenBridge, memoryTokenStore } from '../testing/hosts';
import type { ReaderDescriptor, ReaderInput, ReaderMetadata, ReadResult, StoredTokens } from '../types';

/** An OAuth reader whose token handler is a plain object, to exercise the shared bridge. */
class FakeOAuthReader extends OAuthReader<{ clientId: string; redirectUri: string }> {
  readonly descriptor: ReaderDescriptor = {
    id: 'fake-oauth',
    name: 'Fake OAuth',
    version: '0.1.0',
    kind: 'api',
    domains: ['wearable'],
    dataTypes: [],
    auth: 'oauth2'
  };
  protected readonly configSchema = {
    safeParse: (data: unknown) => {
      const c = data as { clientId?: string; redirectUri?: string };
      return c.clientId && c.redirectUri?.startsWith('https://')
        ? { success: true as const, data: { clientId: c.clientId, redirectUri: c.redirectUri } }
        : { success: false as const, error: { issues: [{ path: ['redirectUri'] }] } };
    }
  };
  authenticated = 0;
  protected tokenHandlerFor() {
    let held: { tokens: { access_token: string; refresh_token: string }; expiresAt: number } | undefined;
    return {
      setTokens: (t: { access_token: string; refresh_token: string }, expiresAt?: number) => {
        held = { tokens: t, expiresAt: expiresAt ?? 0 };
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
    const held = this.opened(this.tokens).getTokens();
    if (!held) return Promise.reject(this.fail('no tokens', 'auth', 'read'));
    return Promise.resolve({
      bundle: this.bundleFrom({ resources: [], bundleKey: 'k' }),
      issues: [],
      provenance: this.provenanceFor(this.bundleFrom({ resources: [], bundleKey: 'k' }))
    });
  }
}

const oauthInput: ReaderInput = {
  kind: 'api',
  sourceId: 'fake-oauth',
  config: { clientId: 'c', redirectUri: 'https://e.org/cb' },
  tokenKey: 'w1'
};
const stored: StoredTokens = {
  accessToken: 'stored-access',
  refreshToken: 'stored-refresh',
  expiresAt: '2099-01-01T00:00:00.000Z'
};

describeTokenBridge(() => new FakeOAuthReader(), { input: oauthInput, tokens: stored, secret: 'https://e.org/cb' });

describe('OAuthReader', () => {
  it('exchanges the code only when nothing is stored', async () => {
    const reader = new FakeOAuthReader();
    await reader.open({ ...oauthInput, authorizationCode: 'code' }, { tokenStore: memoryTokenStore({ w1: stored }) });
    expect(reader.authenticated).toBe(0);
    const fresh = new FakeOAuthReader();
    await fresh.open({ ...oauthInput, authorizationCode: 'code' }, { tokenStore: memoryTokenStore() });
    expect(fresh.authenticated).toBe(1);
  });
});
