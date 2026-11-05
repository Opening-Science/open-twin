import { ConnectorError } from '@open-twin/fhir-core';
import { describe, expect, it, vi } from 'vitest';
import { fileJson, fileText, HealthDataReader, issueFromOutcome, subjectIdentifierSystem } from '../base';
import type { ReaderDescriptor, ReaderInput, ReaderMetadata, ReadRequest, ReadResult } from '../types';

const descriptor: ReaderDescriptor = {
  id: 'probe',
  name: 'Probe',
  version: '0.1.0',
  kind: 'api',
  domains: ['wearable'],
  dataTypes: ['a', 'b'],
  auth: 'bearer'
};

const Shape = {
  safeParse: (data: unknown) =>
    typeof data === 'object' && data !== null && 'ok' in data
      ? { success: true as const, data: data as { ok: boolean } }
      : { success: false as const, error: { issues: [{ path: ['ok'] }] } }
};

/** The protected helpers made public under their own names, so each can be exercised alone. */
class Probe extends HealthDataReader {
  readonly descriptor = descriptor;
  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: { id: 'probe' },
      dataTypes: [],
      capabilities: { incremental: false, sandbox: false, write: false }
    });
  }
  read(): Promise<ReadResult> {
    return Promise.reject(new Error('not under test'));
  }
  public override fetchJson<T>(
    url: string,
    schema: {
      safeParse: (
        d: unknown
      ) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[] }> } };
    },
    operation = 'GET probe'
  ) {
    return super.fetchJson(url, schema, operation);
  }
  public override subjectFor(request: ReadRequest) {
    return super.subjectFor(request);
  }
  public override bundleKeyFor(request: ReadRequest) {
    return super.bundleKeyFor(request);
  }
  public override bundleFrom(options: Parameters<HealthDataReader['bundleFrom']>[0]) {
    return super.bundleFrom(options);
  }
  public override withConnectorTag(bundle: Parameters<HealthDataReader['withConnectorTag']>[0]) {
    return super.withConnectorTag(bundle);
  }
  public override opened<T>(state: T | undefined) {
    return super.opened(state);
  }
  public override parseConfig<T>(schema: Parameters<HealthDataReader['parseConfig']>[0], config: unknown) {
    return super.parseConfig(schema, config) as T;
  }
  public override fail(message: string, code: ConnectorError['code'], operation: string, cause?: unknown) {
    return super.fail(message, code, operation, cause);
  }
  public override loadCursor(key: string) {
    return super.loadCursor(key);
  }
}

const api: ReaderInput = { kind: 'api', sourceId: 'probe', config: {} };
const response = (status: number, body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } });

describe('file inputs', () => {
  it('reads text, bytes or a path, and parses JSON or gives undefined', () => {
    expect(fileText({ kind: 'file', text: 'x' })).toBe('x');
    expect(fileText({ kind: 'file', bytes: new TextEncoder().encode('y') })).toBe('y');
    expect(fileText({ kind: 'file', path: '/nowhere/none.json' })).toBeUndefined();
    expect(fileText(api)).toBeUndefined();
    expect(fileJson({ kind: 'file', text: '{"a":1}' })).toEqual({ a: 1 });
    expect(fileJson({ kind: 'file', text: '{' })).toBeUndefined();
  });
});

describe('open and read order', () => {
  it('matches an api input by id only, and exposes the input only once onOpen succeeded', async () => {
    const probe = new Probe();
    expect(await probe.isThisType(api)).toBe(true);
    expect(await probe.isThisType({ kind: 'api', sourceId: 'other', config: {} })).toBe(false);
    expect(() => probe.opened(undefined)).toThrow(ConnectorError);
    await probe.open(api);
    expect(probe.opened('state')).toBe('state');
  });

  it('parseConfig names the failed field and never the value', () => {
    const probe = new Probe();
    expect(probe.parseConfig(Shape, { ok: true })).toEqual({ ok: true });
    expect(() => probe.parseConfig(Shape, { secret: 'hunter2' })).toThrow(/invalid at: ok/);
    expect(() => probe.parseConfig(Shape, { secret: 'hunter2' })).not.toThrow(/hunter2/);
  });

  it('fail keeps only the cause class name', () => {
    const error = new Probe().fail('x', 'transport', 'op', new TypeError('socket to https://h/?token=1'));
    expect(error.cause).toBe('TypeError');
    expect(new Probe().fail('x', 'unknown', 'op').cause).toBeUndefined();
  });
});

describe('fetchJson', () => {
  it('returns the parsed body through the host fetch and logs the operation only', async () => {
    const fetch = vi.fn(async () => response(200, '{"ok":true}'));
    const logger = { debug: vi.fn(), warn: vi.fn() };
    const probe = new Probe();
    await probe.open(api, { fetch, logger });
    expect(await probe.fetchJson('https://example.invalid/v1?token=abc', Shape, 'GET v1')).toEqual({ ok: true });
    expect(JSON.stringify(logger.debug.mock.calls)).not.toContain('token=abc');
    expect(logger.debug).toHaveBeenCalledWith('request', { reader: 'probe', operation: 'GET v1' });
  });

  it('maps an HTTP failure by status and reads Retry-After, without the body', async () => {
    const probe = new Probe();
    await probe.open(api, { fetch: async () => response(429, '{"secret":"body-text"}', { 'retry-after': '7' }) });
    const error = (await probe
      .fetchJson('https://example.invalid/v1', Shape, 'GET things')
      .catch((e: unknown) => e)) as ConnectorError;
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: 'rate_limit', status: 429, operation: 'GET things', retryAfterSeconds: 7 });
    expect(String(error)).not.toContain('body-text');
  });

  it('is transport when fetch rejects, validation when the body is not JSON or not the shape; no body survives', async () => {
    const probe = new Probe();
    await probe.open(api, { fetch: () => Promise.reject(new TypeError('socket hang up')) });
    const transport = (await probe
      .fetchJson('https://example.invalid/v1', Shape)
      .catch((e: unknown) => e)) as ConnectorError;
    expect(transport).toMatchObject({ code: 'transport', cause: 'TypeError' });

    await probe.open(api, { fetch: async () => response(200, '<html>') });
    const notJson = (await probe
      .fetchJson('https://example.invalid/v1', Shape)
      .catch((e: unknown) => e)) as ConnectorError;
    expect(notJson).toMatchObject({ code: 'validation', cause: 'SyntaxError' });
    expect(JSON.stringify({ m: notJson.message, c: notJson.cause })).not.toContain('<html>');

    await probe.open(api, { fetch: async () => response(200, '{"nope":1}') });
    const wrong = (await probe
      .fetchJson('https://example.invalid/v1', Shape)
      .catch((e: unknown) => e)) as ConnectorError;
    expect(wrong.code).toBe('validation');
    expect(String(wrong)).not.toContain('nope');
  });
});

describe('subject, key, bundle and tag helpers', () => {
  it('uses the caller reference verbatim, else mints a urn:uuid with its Patient (D1)', () => {
    const probe = new Probe();
    expect(probe.subjectFor({ subjectKey: 'u1', subject: { reference: 'Patient/42' } })).toEqual({
      reference: { reference: 'Patient/42' }
    });
    const minted = probe.subjectFor({ subjectKey: 'u1' });
    expect(minted.reference.reference).toBe(`urn:uuid:${minted.patient?.id}`);
    expect(minted.patient?.identifier).toEqual([{ system: subjectIdentifierSystem('probe'), value: 'u1' }]);
  });

  it('keys a bundle by subject, type set and window, so windows differ and type order does not', () => {
    const probe = new Probe();
    const window = { start: '2026-01-01T00:00:00+01:00', end: '2026-01-02T00:00:00+01:00' };
    expect(probe.bundleKeyFor({ subjectKey: 'u1', types: ['b', 'a'], window })).toBe(
      probe.bundleKeyFor({ subjectKey: 'u1', types: ['a', 'b'], window })
    );
    expect(
      probe.bundleFrom({ resources: [], bundleKey: probe.bundleKeyFor({ subjectKey: 'u1', window }) }).id
    ).not.toBe(probe.bundleFrom({ resources: [], bundleKey: probe.bundleKeyFor({ subjectKey: 'u1' }) }).id);
  });

  it('stamps the bundle with the host clock and the connector tag', async () => {
    const probe = new Probe();
    await probe.open(api, { now: () => '2026-05-05T05:05:05Z' });
    const bundle = probe.bundleFrom({ resources: [], bundleKey: 'k' });
    expect(bundle.timestamp).toBe('2026-05-05T05:05:05Z');
    expect(bundle.meta?.tag?.[0]).toMatchObject({ code: 'probe', version: '0.1.0' });
  });

  it('tags every resource, replaces a stale tag of its own, keeps other tags, and leaves the bundle id alone', () => {
    const system = 'http://opentwin.ch/fhir/CodeSystem/connector';
    const bundle = {
      resourceType: 'Bundle' as const,
      type: 'collection' as const,
      id: 'b1',
      entry: [
        { fullUrl: 'urn:uuid:a', resource: { resourceType: 'Patient' as const, id: 'a' } },
        {
          fullUrl: 'urn:uuid:b',
          resource: { resourceType: 'Patient' as const, id: 'b', meta: { tag: [{ system: 'urn:other', code: 'x' }] } }
        },
        {
          fullUrl: 'urn:uuid:c',
          resource: {
            resourceType: 'Patient' as const,
            id: 'c',
            meta: { tag: [{ system, code: 'probe', version: '0.0.1' }] }
          }
        }
      ]
    };
    const tagged = new Probe().withConnectorTag(bundle);
    const tagsOf = (i: number) => tagged.entry?.[i]?.resource?.meta?.tag ?? [];
    expect(tagsOf(0)).toEqual([{ system, code: 'probe', version: '0.1.0' }]);
    expect(tagsOf(1)).toEqual([
      { system: 'urn:other', code: 'x' },
      { system, code: 'probe', version: '0.1.0' }
    ]);
    expect(tagsOf(2)).toEqual([{ system, code: 'probe', version: '0.1.0' }]);
    expect(tagged.id).toBe('b1');
    expect(bundle.entry[0]?.resource.meta).toBeUndefined();
  });

  it('maps a vendor outcome issue, and reads a cursor from the host or gives undefined', async () => {
    expect(issueFromOutcome({ severity: 'fatal', code: 'not-found', diagnostics: 'gone' })).toEqual({
      severity: 'error',
      code: 'not-found',
      details: 'gone'
    });
    expect(issueFromOutcome({ severity: 'warning', code: 'throttled' }).details).toMatch(/vendor/);
    const probe = new Probe();
    await probe.open(api, { cursorStore: { load: () => Promise.resolve('c-1'), save: () => Promise.resolve() } });
    expect(await probe.loadCursor('k')).toBe('c-1');
    expect(await new Probe().loadCursor('k')).toBeUndefined();
  });
});
