import type { Bundle, Observation, Patient } from 'fhir/r4';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFhirBundleFromOuraData } from '../../index';

describe('getFhirBundleFromOuraData (integration)', () => {
  const token = 'integration_token';

  const heartRateResponse = {
    data: [
      {
        timestamp: '2026-06-20T08:00:00+00:00',
        producer_timestamp: 1781856000,
        bpm: 60,
        source: 'awake'
      },
      {
        timestamp: '2026-06-20T08:05:00+00:00',
        producer_timestamp: 1781856300,
        bpm: 62,
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
  });

  it('builds a FHIR collection bundle from a list-based type (heartrate)', async () => {
    mockFetchByType({ heartrate: heartRateResponse });

    const bundle = await getFhirBundleFromOuraData(
      { types: ['heartrate'], start_date: '2026-06-20', end_date: '2026-06-29' },
      token
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.ouraring.com/v2/usercollection/heartrate?'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` })
      })
    );

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(bundle.entry).toHaveLength(2);

    const observations = bundle.entry?.map((entry) => entry.resource as Observation) ?? [];
    for (const observation of observations) {
      expect(observation.resourceType).toBe('Observation');
      expect(observation.code?.coding?.[0]).toMatchObject({ code: '8867-4', display: 'Heart rate' });
    }
    expect(observations[0].valueQuantity?.value).toBe(60);
    expect(observations[1].valueQuantity?.value).toBe(62);
  });

  it('builds a bundle containing a nested patient bundle for a non-list type (personal_info)', async () => {
    mockFetchByType({ personal_info: personalResponse });

    const bundle = await getFhirBundleFromOuraData({ types: ['personal_info'] }, token);

    expect(bundle.entry).toHaveLength(1);
    const nested = bundle.entry?.[0].resource as Bundle;
    expect(nested.resourceType).toBe('Bundle');

    const patient = nested.entry?.[0].resource as Patient;
    expect(patient.resourceType).toBe('Patient');
    expect(patient.gender).toBe('male');
    expect(patient.identifier?.[0]).toMatchObject({ value: 'user-123' });
  });

  it('builds a bundle from multiple requested types preserving order', async () => {
    mockFetchByType({
      heartrate: heartRateResponse,
      personal_info: personalResponse
    });

    const bundle = await getFhirBundleFromOuraData({ types: ['heartrate', 'personal_info'] }, token);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(bundle.entry).toHaveLength(3);

    const [first, second, third] = bundle.entry ?? [];
    expect((first.resource as Observation).resourceType).toBe('Observation');
    expect((second.resource as Observation).resourceType).toBe('Observation');
    expect((third.resource as Bundle).resourceType).toBe('Bundle');
  });

  it('uses the sandbox endpoint when the sandbox flag is enabled', async () => {
    mockFetchByType({ heartrate: heartRateResponse });

    await getFhirBundleFromOuraData({ types: ['heartrate'] }, token, true);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.ouraring.com/v2/sandbox/usercollection/heartrate?'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('throws when a requested type is not supported', async () => {
    await expect(
      getFhirBundleFromOuraData({ types: ['not_a_real_type'] as unknown as ['heartrate'] }, token)
    ).rejects.toThrow('Unsupported request type: not_a_real_type');

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('propagates an error when the Oura API responds with a non-ok status', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    } as unknown as Response);

    await expect(getFhirBundleFromOuraData({ types: ['heartrate'] }, token)).rejects.toThrow(
      'Oura request failed (401) for type "heartrate": Unauthorized'
    );
  });

  it('throws when the response data matches no supported schema', async () => {
    mockFetchByType({
      heartrate: { data: [{ unexpected: 'structure' }], next_token: null }
    });

    await expect(getFhirBundleFromOuraData({ types: ['heartrate'] }, token)).rejects.toThrow(
      'Response data does not match any supported schema.'
    );
  });
});
