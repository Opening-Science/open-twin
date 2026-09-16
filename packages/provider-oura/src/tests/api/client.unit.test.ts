import { ConnectorError } from '@open-twin/fhir-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken } from '../../api/client';
import type { OuraRingAppConfig } from '../../config/config';

describe('Oura OAuth client', () => {
  const config: OuraRingAppConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'https://example.com/callback'
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('reports an OAuth HTTP failure with its status without exposing the body', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: vi.fn()
    } as unknown as Response);

    const error = await getAccessToken('authorization-code', config).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: 'auth', status: 401, operation: 'POST oauth/token' });
    expect(error.message).not.toContain('authorization-code');
  });

  it('reports a non-JSON successful-status response as a typed transport failure', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 502,
      headers: new Headers(),
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <'))
    } as unknown as Response);

    const error = await getAccessToken('authorization-code', config).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: 'transport', status: 502, operation: 'POST oauth/token' });
  });
});
