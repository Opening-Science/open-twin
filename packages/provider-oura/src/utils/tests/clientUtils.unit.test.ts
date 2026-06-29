import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOuraApiSandboxUserCollectionBaseUrl, getOuraApiUserCollectionBaseUrl } from '../../api/endpoints';
import type { RequestParams } from '../../api/schemas/client';
import { requestOuraData } from '../clientUtils';

// Mock dependencies
vi.mock('../../api/endpoints', () => ({
  getOuraApiSandboxUserCollectionBaseUrl: vi.fn(() => 'https://sandbox.api.ouraring.com/v2/usercollection'),
  getOuraApiUserCollectionBaseUrl: vi.fn(() => 'https://api.ouraring.com/v2/usercollection')
}));

vi.mock('../config/constants', () => ({
  SUPPORTED_SCOPES: ['daily_readiness', 'daily_sleep', 'heartrate']
}));

describe('requestOuraData', () => {
  const token = 'mock_token';

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('should fetch data from production URLs for all requested types and parse query strings correctly', async () => {
    const mockResponseData = { data: [] };

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponseData
    } as unknown as Response);

    const requestParams: RequestParams = {
      types: ['daily_activity', 'sleep'],
      start_date: '2026-06-01',
      end_date: '2026-06-07'
    };

    const result = await requestOuraData(requestParams, token, false);

    expect(getOuraApiUserCollectionBaseUrl).toHaveBeenCalledTimes(1);
    expect(getOuraApiSandboxUserCollectionBaseUrl).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const expectedQuery = 'types=daily_activity%2Csleep&start_date=2026-06-01&end_date=2026-06-07';

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `https://api.ouraring.com/v2/usercollection/daily_activity?${expectedQuery}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      }
    );

    expect(result).toEqual([mockResponseData, mockResponseData]);
  });

  it('should use sandbox URL when sandbox flag is true', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({})
    } as unknown as Response);

    await requestOuraData({ types: ['heartrate'] } as RequestParams, token, true);

    expect(getOuraApiSandboxUserCollectionBaseUrl).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/sandbox\.api\.ouraring\.com\/v2\/usercollection\/heartrate/),
      expect.any(Object)
    );
  });

  it('should throw an error immediately if a requested type is not supported', async () => {
    const requestParams = {
      types: ['invalid_type']
    };

    let thrownError: Error | null = null;
    try {
      await requestOuraData(requestParams as RequestParams, token);
    } catch (err) {
      thrownError = err as Error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError?.message).toBe('Unsupported request type: invalid_type');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('should reject and include error body info when fetch response is not ok', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized access token'
    } as unknown as Response);

    const requestParams = {
      types: ['heartrate']
    };

    await expect(requestOuraData(requestParams as RequestParams, token)).rejects.toThrow(
      'Oura request failed (401) for type "heartrate": Unauthorized access token'
    );
  });

  it('should handle fetch errors where text() body parsing fails', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => {
        await new Promise((_, reject) => reject(new Error('Stream error')));
      }
    } as unknown as Response);

    const requestParams = {
      types: ['heartrate']
    } as RequestParams;

    await expect(requestOuraData(requestParams, token)).rejects.toThrow(
      'Oura request failed (500) for type "heartrate": '
    );
  });
});
