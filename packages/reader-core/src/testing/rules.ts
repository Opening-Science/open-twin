/**
 * WHAT: The conformance rules as vitest assertions, plus runFixture, which opens, reads and closes a reader under a guarded fetch.
 * NOT:  Does not validate FHIR itself: rule 4 takes the validator the adapter injects. Rule 1 is checkDescriptor in utils, because the registry gate runs it outside vitest.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d4
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: imports vitest, so import it from a test file only. Rule 5 cannot tell a genuine 0 from 0-for-missing; that defect shows up in rule 8 through `absentValues` only if the fixture has a missing value, so every adapter fixture should include one.
 */
import { CONNECTOR_TAG_SYSTEM, ConnectorError, SYSTEMS } from '@open-twin/fhir-core';
import type { Bundle, Observation, Quantity } from 'fhir/r4';
import { expect, vi } from 'vitest';
import type { IHealthDataReader } from '../reader';
import type { HostServices, Logger, ReaderDescriptor, ReaderInput, ReadRequest, ReadResult } from '../types';
import { type ExpectedSummary, isObservation } from './expected';

export interface ConformanceFixture {
  name: string;
  input: ReaderInput;
  /** API readers route `fetch` to the recorded responses here. */
  host?: HostServices;
  request: ReadRequest;
  /** The summary recorded in expected.json beside the fixture. */
  expected: ExpectedSummary;
}

export interface FhirBundleValidation {
  ok: boolean;
  issues: ReadonlyArray<{ severity: string; message: string; expression?: string }>;
}

export type FhirBundleValidator = (bundle: Bundle) => FhirBundleValidation;

export interface LogLine {
  level: 'debug' | 'warn';
  msg: string;
  meta?: Record<string, unknown>;
}

export interface FixtureRun {
  result: ReadResult;
  logs: LogLine[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const BEARER = /bearer\s+[a-z0-9._~+/-]{8,}/i;
const TOKEN_FIELD = /"(access_token|refresh_token|client_secret)"\s*:/i;

const refusingFetch = (phase: string) =>
  vi.fn<typeof fetch>(() => Promise.reject(new Error(`fetch is not allowed during ${phase}`)));

/** Runs `fn` with `globalThis.fetch` replaced, because the wrapped providers still call the global one. */
export async function withGlobalFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const previous = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
}

function recordingLogger(logs: LogLine[]): Logger {
  return {
    debug: (msg, meta) => {
      logs.push(meta ? { level: 'debug', msg, meta } : { level: 'debug', msg });
    },
    warn: (msg, meta) => {
      logs.push(meta ? { level: 'warn', msg, meta } : { level: 'warn', msg });
    }
  };
}

/**
 * Opens the reader with a refusing fetch, reads with the fixture's fetch (or a refusing
 * one when it has none), closes, and returns the result with every log line.
 */
export async function runFixture(
  factory: () => IHealthDataReader,
  fixture: ConformanceFixture,
  options: { now: string; request?: ReadRequest }
): Promise<FixtureRun> {
  const logs: LogLine[] = [];
  let active: typeof fetch = refusingFetch('open');
  const delegate: typeof fetch = (input, init) => active(input, init);
  const host: HostServices = {
    ...fixture.host,
    fetch: delegate,
    now: () => options.now,
    logger: recordingLogger(logs)
  };

  const reader = factory();
  await withGlobalFetch(delegate, () => reader.open(fixture.input, host));
  active = fixture.host?.fetch ?? refusingFetch('read of a fixture without a recorded fetch');
  const result = await withGlobalFetch(delegate, () => reader.read(options.request ?? fixture.request));
  active = refusingFetch('close');
  await withGlobalFetch(delegate, () => reader.close());
  return { result, logs };
}

/** Rule 2: `isThisType` accepts the reader's own fixture and makes no network call. */
export async function expectIsThisTypeAccepts(reader: IHealthDataReader, fixture: ConformanceFixture): Promise<void> {
  const refuse = refusingFetch('isThisType');
  const accepted = await withGlobalFetch(refuse, async () => reader.isThisType(fixture.input)).catch(
    (error: unknown) => error
  );
  expect(refuse, 'rule 2: isThisType called fetch').not.toHaveBeenCalled();
  expect(accepted, `rule 2: isThisType rejected the fixture "${fixture.name}"`).toBe(true);
}

/** Rule 3: `open` with an invalid input throws ConnectorError `validation`, operation `open`, quoting nothing. */
export async function expectOpenRejectsInvalid(
  factory: () => IHealthDataReader,
  invalidInput: ReaderInput,
  secrets: Record<string, string> = {}
): Promise<void> {
  const refuse = refusingFetch('open');
  const error = await withGlobalFetch(refuse, () => factory().open(invalidInput, { fetch: refuse })).then(
    () => undefined,
    (reason: unknown) => reason
  );
  expect(error, 'rule 3: open accepted an invalid input').toBeInstanceOf(ConnectorError);
  expect(error, 'rule 3: open must fail with code validation on operation open').toMatchObject({
    code: 'validation',
    operation: 'open'
  });
  expect(refuse, 'rule 3: open called fetch').not.toHaveBeenCalled();

  const serialised = `${String(error)} ${JSON.stringify((error as { cause?: unknown }).cause ?? '')}`;
  expect(leaks(serialised, secrets), 'rule 3: the open error carries a secret, an e-mail or a token').toEqual([]);
}

/** Rule 3, second half: `open` on a valid fixture never fetches. */
export async function expectOpenDoesNotFetch(
  factory: () => IHealthDataReader,
  fixture: ConformanceFixture
): Promise<void> {
  const refuse = refusingFetch('open');
  const opened = await withGlobalFetch(refuse, () =>
    factory().open(fixture.input, { ...fixture.host, fetch: refuse })
  ).then(
    () => true,
    (error: unknown) => error
  );
  expect(refuse, 'rule 3: open called fetch').not.toHaveBeenCalled();
  expect(opened, `rule 3: open threw on the fixture "${fixture.name}"`).toBe(true);
}

/** Rule 4: the bundle passes the injected validator with no error. */
export function expectValidBundle(bundle: Bundle, validate: FhirBundleValidator): void {
  const outcome = validate(bundle);
  const errors = outcome.issues
    .filter((issue) => issue.severity === 'error' || issue.severity === 'fatal')
    .map((issue) => `${issue.expression ?? '(no path)'}: ${issue.message}`);
  expect(errors, 'rule 4: the validator reported errors').toEqual([]);
  expect(outcome.ok, 'rule 4: the validator reported the bundle as not ok').toBe(true);
}

function hasValue(element: object): boolean {
  return Object.keys(element).some((key) => key.startsWith('value'));
}

function expectUcum(quantity: Quantity | undefined, where: string): void {
  if (!quantity) return;

  expect(quantity.system, `rule 5: ${where}.valueQuantity.system is not UCUM`).toBe(SYSTEMS.UCUM);
  expect(quantity.code, `rule 5: ${where}.valueQuantity has no UCUM code`).toBeTruthy();
  expect(quantity.unit, `rule 5: ${where}.valueQuantity has no unit`).toBeTruthy();
}

/** Rule 5: every Observation is tagged, linked per D1, identified per D2, in UCUM, and says why a value is absent. */
export function expectObservations(bundle: Bundle, descriptor: ReaderDescriptor, request: ReadRequest): void {
  const patients = new Set<string>();
  const observations: Array<{ index: number; observation: Observation }> = [];
  for (const [index, entry] of (bundle.entry ?? []).entries()) {
    if (entry.resource?.resourceType === 'Patient' && entry.fullUrl) patients.add(entry.fullUrl);

    if (isObservation(entry.resource)) observations.push({ index, observation: entry.resource });
  }

  expect(observations, 'rule 5: the bundle carries no Observation').not.toHaveLength(0);

  for (const { index, observation } of observations) {
    const where = `Bundle.entry[${index}]`;
    expect(UUID.test(observation.id ?? ''), `rule 5: ${where} id is not a UUID (D2)`).toBe(true);

    const tag = observation.meta?.tag?.find((t) => t.system === CONNECTOR_TAG_SYSTEM);
    expect(tag, `rule 5: ${where} has no connector meta tag`).toBeDefined();
    expect(tag, `rule 5: ${where} connector tag is not "${descriptor.id}" ${descriptor.version}`).toMatchObject({
      code: descriptor.id,
      version: descriptor.version
    });

    const subject = observation.subject?.reference;

    if (request.subject) {
      expect(subject, `rule 5: ${where} subject is not the caller's (D1)`).toBe(request.subject.reference);
    } else {
      expect(subject?.startsWith('urn:uuid:'), `rule 5: ${where} subject is not a urn:uuid reference (D1)`).toBe(true);
      expect(
        patients.has(subject ?? ''),
        `rule 5: ${where} subject points at no Patient entry in the bundle (D1)`
      ).toBe(true);
    }

    const valued = hasValue(observation);
    const absent = observation.dataAbsentReason !== undefined;
    const panel = (observation.component?.length ?? 0) > 0;
    expect(valued || absent || panel, `rule 5: ${where} has neither a value nor dataAbsentReason`).toBe(true);
    expect(valued && absent, `rule 5: ${where} has both a value and dataAbsentReason`).toBe(false);
    expectUcum(observation.valueQuantity, where);

    for (const [c, component] of (observation.component ?? []).entries()) {
      const at = `${where}.component[${c}]`;
      const componentValued = hasValue(component);
      const componentAbsent = component.dataAbsentReason !== undefined;
      expect(componentValued || componentAbsent, `rule 5: ${at} has neither a value nor dataAbsentReason`).toBe(true);
      expect(componentValued && componentAbsent, `rule 5: ${at} has both a value and dataAbsentReason`).toBe(false);
      expectUcum(component.valueQuantity, at);
    }
  }
}

/** The same window length, starting where the given one ends, in the window's own offset. */
export function shiftWindow(window: { start: string; end: string }): { start: string; end: string } {
  const offset = /(Z|[+-]\d{2}:\d{2})$/.exec(window.end)?.[1] ?? '';
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);

  if (Number.isNaN(start) || Number.isNaN(end)) throw new TypeError('shiftWindow: the window is not ISO 8601');

  const length = Math.max(end - start, 24 * 60 * 60 * 1000);
  const local = (ms: number) => {
    const shift =
      offset === 'Z' || offset === ''
        ? 0
        : (Number(offset.slice(0, 3)) * 60 + Number(offset.slice(0, 1) + offset.slice(4, 6))) * 60_000;
    return new Date(ms + shift).toISOString().replace(/\.\d{3}Z$/, offset || 'Z');
  };
  return { start: local(end), end: local(end + length) };
}

/** Rule 6: the same request and clock give byte-identical bundles; a different window gives a different Bundle.id. */
export async function expectDeterministic(
  factory: () => IHealthDataReader,
  fixture: ConformanceFixture,
  now: string
): Promise<void> {
  const first = await runFixture(factory, fixture, { now });
  const second = await runFixture(factory, fixture, { now });
  expect(
    JSON.stringify(second.result.bundle),
    'rule 6: two reads with the same request and clock gave different bundles'
  ).toBe(JSON.stringify(first.result.bundle));

  if (!fixture.request.window) return;

  const shifted = await runFixture(factory, fixture, {
    now,
    request: { ...fixture.request, window: shiftWindow(fixture.request.window) }
  });
  expect(shifted.result.bundle.id, 'rule 6: two requests with different windows share one Bundle.id').not.toBe(
    first.result.bundle.id
  );
}

function leaks(text: string, secrets: Record<string, string>): string[] {
  const found: string[] = [];
  for (const [label, value] of Object.entries(secrets)) {
    if (value && text.includes(value)) found.push(`the secret "${label}"`);
  }

  if (EMAIL.test(text)) found.push('an e-mail address');

  if (BEARER.test(text)) found.push('a bearer token');

  if (TOKEN_FIELD.test(text)) found.push('a token field');

  return found;
}

/** Rule 7: no issue, provenance entry or log line carries a secret, an e-mail or a token. */
export function expectNoLeak(run: FixtureRun, secrets: Record<string, string> = {}): void {
  expect(leaks(JSON.stringify(run.result.issues), secrets), 'rule 7: an issue leaks').toEqual([]);
  expect(leaks(JSON.stringify(run.result.provenance), secrets), 'rule 7: the provenance leaks').toEqual([]);
  expect(leaks(JSON.stringify(run.logs), secrets), 'rule 7: a log line leaks').toEqual([]);
}
