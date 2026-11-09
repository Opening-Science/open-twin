import { describe, expect, it } from 'vitest';
import { describeTokenBridge, memoryTokenStore } from '../testing/hosts';
import type { ReaderInput, StoredTokens } from '../types';
import { FakeOAuthReader } from './buildOAuthReader';

const input: ReaderInput = {
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

describeTokenBridge(() => new FakeOAuthReader(), { input, tokens: stored, secret: 'https://e.org/cb' });

describe('OAuthReader', () => {
  describe('open', () => {
    const withCode = { ...input, authorizationCode: 'code' };

    it('restores stored tokens and does not exchange the code', async () => {
      const reader = new FakeOAuthReader();
      await reader.open(withCode, { tokenStore: memoryTokenStore({ w1: stored }) });

      expect(reader.authenticated).toBe(0);
    });

    it('exchanges the code when nothing is stored', async () => {
      const reader = new FakeOAuthReader();
      await reader.open(withCode, { tokenStore: memoryTokenStore() });

      expect(reader.authenticated).toBe(1);
    });
  });
});
