import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleHealthClient } from '../../api/client';
import { getFhirBundleFromGoogleHealthData } from '../../sync';
import { SUBJECT_KEY } from '../support/context';

const credentials = { access_token: 'access-0123456789', refresh_token: 'refresh', expiry_date: 4_070_908_800_000 };

const weight = {
  dataPoints: [
    {
      dataSource: { recordingMethod: 'MANUAL_ENTRY', platform: 'FITBIT' },
      weight: { sampleTime: { physicalTime: '2026-07-07T07:33:14.417Z', utcOffset: '7200s' }, weightGrams: 86000 }
    }
  ]
};

function clientWith(fetch: typeof globalThis.fetch): GoogleHealthClient {
  const client = new GoogleHealthClient(
    { clientId: 'client', clientSecret: 'secret', redirectUri: 'https://example.org/callback' },
    { fetch }
  );
  client.restoreCredentials(credentials);
  return client;
}

const sync = (client: GoogleHealthClient, start_date: string, end_date: string) =>
  getFhirBundleFromGoogleHealthData({
    client,
    types: ['weight'],
    start_date,
    end_date,
    timeZone: 'Europe/Zurich',
    subjectKey: SUBJECT_KEY,
    timestamp: '1970-01-01T00:00:00Z'
  });

describe('a client with a host fetch and restored credentials', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads through the host fetch and never the global one', async () => {
    const host = vi.fn(async () => Response.json(weight));
    vi.stubGlobal('fetch', () => Promise.reject(new Error('the global fetch must not be called')));

    const { bundle } = await sync(clientWith(host), '2026-07-06T00:00:00+02:00', '2026-07-08T00:00:00+02:00');

    expect(host).toHaveBeenCalledTimes(1);
    expect(bundle.entry?.map((entry) => entry.resource?.resourceType)).toEqual(['Patient', 'Observation']);
  });

  it('returns the restored credentials, so a host can save them back', () => {
    expect(clientWith(vi.fn()).getCredentials()).toMatchObject(credentials);
  });

  it('gives two windows two bundle ids', async () => {
    const client = clientWith(async () => Response.json(weight));
    const first = await sync(client, '2026-07-06T00:00:00+02:00', '2026-07-08T00:00:00+02:00');
    const second = await sync(client, '2026-07-08T00:00:00+02:00', '2026-07-10T00:00:00+02:00');

    expect(first.bundle.id).not.toBe(second.bundle.id);
  });
});
