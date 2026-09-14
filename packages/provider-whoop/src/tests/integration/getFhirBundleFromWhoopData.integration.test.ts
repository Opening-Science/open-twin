import { describe, expect, it, vi } from 'vitest';
import type { WhoopAppConfig } from '../../config/config';
import { getFhirBundleFromWhoopData } from '../../index';
import { TokenHandler } from '../../utils/tokenUtils';

describe('getFhirBundleFromWhoopData (integration)', () => {
  const appConfig: WhoopAppConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'https://example.com/callback'
  };

  const tokenResponse = {
    access_token: 'access-token-test',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'refresh-token-test'
  };

  const recoveryPage = {
    records: [
      {
        sleep_id: 's1',
        created_at: '2026-06-20T08:00:00.000Z',
        score: { recovery_score: 80, resting_heart_rate: 55 }
      }
    ],
    next_token: null
  };

  const cyclePage = { records: [], next_token: null };
  const sleepPage = { records: [], next_token: null };

  it('maps fetched pages into a FHIR bundle', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/oauth/oauth2/token')) {
        return new Response(JSON.stringify(tokenResponse), { status: 200 });
      }
      if (url.includes('/recovery')) {
        return new Response(JSON.stringify(recoveryPage), { status: 200 });
      }
      if (url.includes('/cycle')) {
        return new Response(JSON.stringify(cyclePage), { status: 200 });
      }
      if (url.includes('/activity/sleep')) {
        return new Response(JSON.stringify(sleepPage), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const tokenHandler = new TokenHandler(appConfig, 'auth-code');
    await tokenHandler.authenticate();

    const result = await getFhirBundleFromWhoopData(
      { start: '2026-06-01T00:00:00.000Z', end: '2026-06-30T23:59:59.000Z' },
      tokenHandler,
      { subjectKey: 'user-1', timestamp: '2026-07-26T10:00:00Z' }
    );

    expect(result.bundle.entry?.some((e) => e.resource?.resourceType === 'Observation')).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});
