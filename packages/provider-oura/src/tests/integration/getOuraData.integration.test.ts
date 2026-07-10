import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OuraHeartRateList } from '../../api/schemas/heartrate';
import type { OuraPersonal } from '../../api/schemas/personal';
import type { OuraRingAppConfig } from '../../config/config';
import { getOuraData } from '../../index';
import { TokenHandler } from '../../utils/tokenUtils';

describe('getOuraData (integration)', () => {
  const appConfig: OuraRingAppConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'https://example.com/callback'
  };

  const authorizationCode = 'test-authorization-code';

  let tokenHandler: TokenHandler;

  const heartRateResponse = {
    data: [
      {
        timestamp: '2026-06-20T08:00:00+00:00',
        producer_timestamp: 1781856000,
        bpm: 60,
        source: 'awake'
      }
    ],
    next_token: null
  };

  const personalResponse = {
    id: 'user-123',
    age: 30,
    weight: 70,
    height: 1.8,
    biological_sex: 'male',
    email: 'user@example.com'
  };

  const okJson = (body: unknown): Response =>
    ({
      ok: true,
      json: async () => body
    }) as unknown as Response;

  const mockFetchByType = (routes: Record<string, unknown>) => {
    vi.mocked(globalThis.fetch).mockImplementation((input) => {
      const url = String(input);
      const match = Object.keys(routes).find((type) => url.includes(`/usercollection/${type}?`));
      if (!match) {
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
      }
      return Promise.resolve(okJson(routes[match]));
    });
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    tokenHandler = new TokenHandler(appConfig, authorizationCode);

    vi.spyOn(tokenHandler, 'getAccessToken').mockResolvedValue('mock-access-token');
  });

  it('fetches and infers a single list-based type (heartrate)', async () => {
    mockFetchByType({ heartrate: heartRateResponse });

    const result = await getOuraData(
      { types: ['heartrate'], start_date: '2026-06-20', end_date: '2026-06-29' },
      tokenHandler
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.ouraring.com/v2/usercollection/heartrate?'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer mock-access-token' })
      })
    );

    expect(result).toHaveLength(1);
    const [heartRate] = result as [OuraHeartRateList];
    expect(heartRate.data[0].bpm).toBe(60);
    expect(heartRate.data[0].source).toBe('awake');
  });

  it('fetches and infers a non-list type (personal_info)', async () => {
    mockFetchByType({ personal_info: personalResponse });

    const result = await getOuraData({ types: ['personal_info'] }, tokenHandler);

    expect(result).toHaveLength(1);
    const [personal] = result as [OuraPersonal];
    expect(personal).toEqual(personalResponse);
  });

  it('resolves multiple requested types preserving order', async () => {
    mockFetchByType({
      heartrate: heartRateResponse,
      personal_info: personalResponse
    });

    const result = await getOuraData({ types: ['heartrate', 'personal_info'] }, tokenHandler);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect((result[0] as OuraHeartRateList).data[0].bpm).toBe(60);
    expect(result[1] as OuraPersonal).toEqual(personalResponse);
  });

  it('throws when a requested type is not supported', async () => {
    await expect(getOuraData({ types: ['not_a_real_type'] as unknown as ['heartrate'] }, tokenHandler)).rejects.toThrow(
      'Unsupported request type: not_a_real_type'
    );

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('propagates an error when the Oura API responds with a non-ok status', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    } as unknown as Response);

    await expect(getOuraData({ types: ['heartrate'] }, tokenHandler)).rejects.toThrow(
      'Oura request failed (401) for type "heartrate": Unauthorized'
    );
  });

  it('throws when the response data matches no supported schema', async () => {
    mockFetchByType({
      heartrate: { data: [{ unexpected: 'structure' }], next_token: null }
    });

    await expect(getOuraData({ types: ['heartrate'] }, tokenHandler)).rejects.toThrow(
      'Response data does not match any supported schema.'
    );
  });
});
