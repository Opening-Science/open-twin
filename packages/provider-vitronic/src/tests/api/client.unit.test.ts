import { ConnectorError } from '@open-twin/fhir-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BodyLoopClient } from '../../api/client';
import { getFhirBundleFromVitronicData } from '../../index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function tokenResponse(): Response {
  return jsonResponse({ access_token: 'issued-token', token_type: 'Bearer', expires_in: 3600 });
}

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

describe('BodyLoopClient viatar list', () => {
  const username = 'person@example.com';
  const password = 'not-a-real-password';

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('filters GET /viatars/ by integer proband_id and never requests /probands', async () => {
    const listed = [
      { viatar_id: 1, proband_id: 7 },
      { viatar_id: 2, proband_id: 8 },
      { viatar_id: 3, proband_id: 7 },
      { viatar_id: 4, proband_id: null }
    ];
    vi.mocked(globalThis.fetch).mockImplementation((input) => {
      const url = String(input);
      if (url.includes('authentification/token')) return Promise.resolve(tokenResponse());
      if (url.endsWith('/api/v2/viatars/')) return Promise.resolve(jsonResponse(listed));
      return Promise.resolve(jsonResponse({}, 404));
    });
    const client = new BodyLoopClient({ baseUrl: 'https://bodyloop.example', username, password, scope: 'admin' });

    const matches = await client.getAvailableViatars(7);

    expect(matches.map((row) => row.viatar_id)).toEqual([1, 3]);
    const urls = vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/probands'))).toBe(false);
    expect(urls.some((url) => url.endsWith('/api/v2/viatars/'))).toBe(true);
  });

  it('rejects a non-integer proband_id before any request', async () => {
    const client = new BodyLoopClient({
      baseUrl: 'https://bodyloop.example',
      username,
      password,
      scope: 'admin'
    });

    const error = await client.getAvailableViatars(1.5).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: 'validation', operation: 'GET viatars' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('getFhirBundleFromVitronicData never reads /probands', () => {
  it('fetches the viatar and measurements only', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn((input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('authentification/token')) return Promise.resolve(tokenResponse());
      if (url.includes('/api/v2/viatars/scan-1/heights/')) return Promise.resolve(jsonResponse([]));
      if (url.includes('/api/v2/viatars/scan-1')) {
        return Promise.resolve(
          jsonResponse({ viatar_id: 1, proband_id: 7, meta: { crtime: '2026-07-25T09:15:00+02:00' } })
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    const client = new BodyLoopClient({
      baseUrl: 'https://bodyloop.example',
      username: 'person@example.com',
      password: 'not-a-real-password',
      scope: 'admin'
    });
    const getProband = vi.spyOn(client, 'getProband');

    const { bundle } = await getFhirBundleFromVitronicData(client, 'scan-1', ['height']);

    expect(bundle.resourceType).toBe('Bundle');
    expect(urls.some((url) => url.includes('/probands'))).toBe(false);
    expect(getProband).not.toHaveBeenCalled();
  });
});
