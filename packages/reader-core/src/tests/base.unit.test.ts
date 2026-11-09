import { ConnectorError } from '@open-twin/fhir-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { HealthDataReader } from '../base';
import type { ReaderInput, ReadRequest, StoredTokens } from '../types';
import { subjectIdentifierSystem } from '../utils/subject';
import { buildHealthDataReader, openHealthDataReader, PROBE_STORE_KEY, PROBE_URL } from './buildHealthDataReader';

const api: ReaderInput = { kind: 'api', sourceId: 'probe', config: { url: PROBE_URL } };
const request: ReadRequest = { subjectKey: 'u1' };
const ok = async () => Response.json({ ok: true });

const response = (status: number, body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } });

async function readError(fetch: typeof globalThis.fetch): Promise<ConnectorError> {
  const reader = await openHealthDataReader({ fetch });
  return (await reader.read(request).catch((error: unknown) => error)) as ConnectorError;
}

describe('HealthDataReader', () => {
  describe('lifecycle', () => {
    it('matches an api input by its id only', async () => {
      const reader = buildHealthDataReader();

      expect(await reader.isThisType(api)).toBe(true);
      expect(await reader.isThisType({ ...api, sourceId: 'other' })).toBe(false);
    });

    it('fails read before open with validation', async () => {
      await expect(buildHealthDataReader().read(request)).rejects.toMatchObject({ code: 'validation' });
    });

    it('serves one connection: a second open fails until close', async () => {
      const reader = await openHealthDataReader({ fetch: ok });

      await expect(reader.open(api)).rejects.toThrow(/one instance per connection/);
      await reader.close();
      await expect(reader.open(api, { fetch: ok })).resolves.toBeUndefined();
    });

    it('stays closed after a failed open, so it can be opened again', async () => {
      const reader = buildHealthDataReader();

      await expect(reader.open({ ...api, config: { secret: 'hunter2' } })).rejects.toThrow(/invalid at: url/);
      await expect(reader.open(api, { fetch: ok })).resolves.toBeUndefined();
    });

    it('names the failed config field and never its value', async () => {
      await expect(buildHealthDataReader().open({ ...api, config: { secret: 'hunter2' } })).rejects.not.toThrow(
        /hunter2/
      );
    });
  });

  describe('fetchJson', () => {
    it('reads through the host fetch and logs the operation only', async () => {
      const fetch = vi.fn(ok);
      const logger = { debug: vi.fn(), warn: vi.fn() };
      const reader = await openHealthDataReader({ fetch, logger });

      await reader.read(request);

      expect(fetch).toHaveBeenCalledOnce();
      expect(logger.debug).toHaveBeenCalledWith('request', { reader: 'probe', operation: 'GET probe' });
      expect(JSON.stringify(logger.debug.mock.calls)).not.toContain('token=abc');
    });

    it('maps an HTTP failure by status and reads Retry-After, without the body', async () => {
      const error = await readError(async () => response(429, '{"secret":"body-text"}', { 'retry-after': '7' }));

      expect(error).toBeInstanceOf(ConnectorError);
      expect(error).toMatchObject({ code: 'rate_limit', status: 429, operation: 'GET probe', retryAfterSeconds: 7 });
      expect(String(error)).not.toContain('body-text');
    });

    it('is transport when fetch rejects, and keeps only the class name of the cause', async () => {
      const error = await readError(() => Promise.reject(new TypeError('socket to https://h/?token=1')));

      expect(error).toMatchObject({ code: 'transport', cause: 'TypeError' });
    });

    it('is validation when the body is not JSON or not the shape, and quotes neither', async () => {
      const notJson = await readError(async () => response(200, '<html>'));
      const wrongShape = await readError(async () => response(200, '{"nope":1}'));

      expect(notJson).toMatchObject({ code: 'validation', cause: 'SyntaxError' });
      expect(JSON.stringify({ m: notJson.message, c: notJson.cause })).not.toContain('<html>');
      expect(wrongShape.code).toBe('validation');
      expect(String(wrongShape)).not.toContain('nope');
    });
  });

  describe('subjectFor', () => {
    let reader: HealthDataReader;

    beforeAll(async () => {
      reader = await openHealthDataReader({ fetch: ok });
    });

    it('uses the caller reference as given and adds no Patient', async () => {
      const { bundle } = await reader.read({ ...request, subject: { reference: 'Patient/42' } });

      expect(bundle.entry ?? []).toHaveLength(0);
    });

    it('mints a urn:uuid and carries the Patient it points at (D1)', async () => {
      const { bundle } = await reader.read(request);
      const patient = bundle.entry?.[0];

      expect(patient?.fullUrl).toBe(`urn:uuid:${patient?.resource?.id}`);
      expect(patient?.resource).toMatchObject({
        identifier: [{ system: subjectIdentifierSystem('probe'), value: 'u1' }]
      });
    });
  });

  describe('bundleKeyFor', () => {
    const window = { start: '2026-01-01T00:00:00+01:00', end: '2026-01-02T00:00:00+01:00' };

    let reader: HealthDataReader;

    beforeAll(async () => {
      reader = await openHealthDataReader({ fetch: ok });
    });

    it('ignores the order of the types and changes with the window', async () => {
      const idOf = async (r: ReadRequest) => (await reader.read(r)).bundle.id;

      expect(await idOf({ ...request, types: ['b', 'a'], window })).toBe(
        await idOf({ ...request, types: ['a', 'b'], window })
      );
      expect(await idOf({ ...request, window })).not.toBe(await idOf(request));
    });
  });

  describe('host clock and stores', () => {
    it('stamps the bundle and the provenance with the host clock', async () => {
      const reader = await openHealthDataReader({ fetch: ok, now: () => '2026-05-05T05:05:05Z' });
      const { bundle, provenance } = await reader.read(request);

      expect(bundle.timestamp).toBe('2026-05-05T05:05:05Z');
      expect(provenance.retrievedAt).toBe('2026-05-05T05:05:05Z');
    });

    it('restores a cursor at open and saves the new one at close', async () => {
      const saved = new Map<string, string>([[PROBE_STORE_KEY, 'c-1']]);
      const cursorStore = {
        load: async (key: string) => await Promise.resolve(saved.get(key)),
        save: async (key: string, cursor: string) => {
          await Promise.resolve(saved.set(key, cursor));
        }
      };
      const reader = await openHealthDataReader({ fetch: ok, cursorStore });

      expect((await reader.read(request)).cursor).toBe('c-1');

      await reader.read({ ...request, window: { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' } });
      await reader.close();

      expect(saved.get(PROBE_STORE_KEY)).toBe('2026-01-02T00:00:00Z');
    });

    it('loads and saves tokens through the host store, and works without one', async () => {
      const tokens: StoredTokens = { accessToken: 'a', expiresAt: '2099-01-01T00:00:00Z' };
      const tokenStore = { load: vi.fn(async () => await Promise.resolve(tokens)), save: vi.fn(), clear: vi.fn() };
      const withStore = await openHealthDataReader({ fetch: ok, tokenStore });
      const withoutStore = await openHealthDataReader({ fetch: ok });

      await withStore.close();
      await withoutStore.close();

      expect(tokenStore.save).toHaveBeenCalledWith(PROBE_STORE_KEY, tokens);
    });
  });
});
