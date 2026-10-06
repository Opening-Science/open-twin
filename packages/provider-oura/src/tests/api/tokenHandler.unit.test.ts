import { ConnectorError } from '@open-twin/fhir-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenResponse } from '../../api/schemas/auth';
import type { OuraRingAppConfig } from '../../config/config';
import { TokenHandler } from '../../utils/tokenUtils';

const config: OuraRingAppConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://example.com/callback'
};

const storedPair: TokenResponse = {
  access_token: 'ota_access',
  token_type: 'bearer',
  expires_in: 86400,
  refresh_token: 'ota_refresh'
};

const exchangedPair: TokenResponse = {
  access_token: 'ota_exchanged',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'ota_refresh_1'
};

const refreshedPair: TokenResponse = {
  access_token: 'ota_refreshed',
  token_type: 'bearer',
  expires_in: 7200,
  refresh_token: 'ota_refresh_new'
};

function jsonResponse(body: TokenResponse): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body)
  } as unknown as Response;
}

describe('TokenHandler.getTokens', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns null before authenticate or setTokens', () => {
    expect(new TokenHandler(config, 'authorization-code').getTokens()).toBeNull();
  });

  it('returns the pair setTokens stored', () => {
    const handler = new TokenHandler(config, 'authorization-code');
    handler.setTokens(storedPair);
    expect(handler.getTokens()).toEqual({
      access_token: 'ota_access',
      token_type: 'bearer',
      expires_in: 86400,
      refresh_token: 'ota_refresh'
    });
  });

  it('returns a copy so host mutation cannot rewrite in-memory tokens', () => {
    const handler = new TokenHandler(config, 'authorization-code');
    handler.setTokens(storedPair);
    const snapshot = handler.getTokens();
    if (!snapshot) throw new Error('expected tokens after setTokens');
    snapshot.access_token = 'mutated';
    expect(handler.getTokens()?.access_token).toBe('ota_access');
  });

  it('returns the pair authenticate stored', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(exchangedPair));
    const handler = new TokenHandler(config, 'authorization-code');
    await handler.authenticate();
    expect(handler.getTokens()).toEqual({
      access_token: 'ota_exchanged',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'ota_refresh_1'
    });
  });

  it('returns the rotated pair after refresh', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(refreshedPair));
    const handler = new TokenHandler(config, 'authorization-code');
    handler.setTokens({
      access_token: 'ota_access_old',
      token_type: 'bearer',
      expires_in: 0,
      refresh_token: 'ota_refresh_old'
    });
    await handler.getAccessToken();
    expect(handler.getTokens()).toEqual({
      access_token: 'ota_refreshed',
      token_type: 'bearer',
      expires_in: 7200,
      refresh_token: 'ota_refresh_new'
    });
  });

  it('reports a failed token HTTP without quoting tokens or the authorization code', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: vi.fn()
    } as unknown as Response);

    const error = await new TokenHandler(config, 'authorization-code')
      .authenticate()
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: 'auth', status: 401, operation: 'POST oauth/token' });
    expect((error as ConnectorError).message).not.toContain('ota_access');
    expect((error as ConnectorError).message).not.toContain('ota_refresh');
    expect((error as ConnectorError).message).not.toContain('authorization-code');
  });
});
