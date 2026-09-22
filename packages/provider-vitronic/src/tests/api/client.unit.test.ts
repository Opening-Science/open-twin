import { ConnectorError } from '@open-twin/fhir-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BodyLoopClient } from '../../api/client';

describe('BodyLoopClient authentication', () => {
  const username = 'person@example.com';
  const password = 'not-a-real-password';

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('does not expose credentials when the password-grant token request fails', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers()
    } as unknown as Response);
    const client = new BodyLoopClient({ baseUrl: 'https://bodyloop.example', username, password, scope: 'admin' });

    const error = await client.getToken().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: 'auth', status: 401, operation: 'POST authentification/token' });
    expect(String(error)).not.toContain(username);
    expect(String(error)).not.toContain(password);
  });
});
