/**
 * WHAT: The eight conformance rules as plain checks that return violations, plus runFixture, which opens, reads and closes a reader under a guarded fetch.
 * NOT:  Does not depend on a test runner. Does not validate FHIR itself: rule 4 takes the validator the adapter injects.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d4
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: rule 5 cannot tell a genuine 0 from 0-for-missing. That defect shows up in rule 8 through `absentValues` only if the fixture has a missing value, so every adapter fixture should include one.
 */
import { CONNECTOR_TAG_SYSTEM, ConnectorError, SYSTEMS } from '@open-twin/fhir-core';
import type { Bundle, Observation, Quantity, Resource } from 'fhir/r4';
import type { IHealthDataReader } from '../reader';
import type { HostServices, Logger, ReaderDescriptor, ReaderInput, ReadRequest, ReadResult } from '../types';
import { diffSummary, type ExpectedSummary, summarise } from './expected';

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

const isObservation = (resource: Resource | undefined): resource is Observation =>
  resource?.resourceType === 'Observation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const BEARER = /bearer\s+[a-z0-9._~+/-]{8,}/i;
const TOKEN_FIELD = /"(access_token|refresh_token|client_secret)"\s*:/i;

/** A fetch that counts attempts and throws, so a reader that touches the network at the wrong time fails loudly. */
export function throwingFetch(phase: string): { fetch: typeof fetch; calls: () => number } {
  let calls = 0;
  const impl: typeof fetch = () => {
    calls += 1;
    return Promise.reject(new Error(`fetch is not allowed during ${phase}`));
  };
  return { fetch: impl, calls: () => calls };
}

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
 * Opens the reader with a throwing fetch, reads with the fixture's fetch (or a throwing
 * one when it has none), closes, and returns the result with every log line.
 */
export async function runFixture(
  factory: () => IHealthDataReader,
  fixture: ConformanceFixture,
  options: { now: string; request?: ReadRequest }
): Promise<FixtureRun> {
  const logs: LogLine[] = [];
  const openGuard = throwingFetch('open');
  const readGuard = throwingFetch('read of a fixture without a recorded fetch');
  let active: typeof fetch = openGuard.fetch;
  const delegate: typeof fetch = (input, init) => active(input, init);
  const host: HostServices = {
    ...fixture.host,
    fetch: delegate,
    now: () => options.now,
    logger: recordingLogger(logs)
  };

  const reader = factory();
  await withGlobalFetch(delegate, () => reader.open(fixture.input, host));
  active = fixture.host?.fetch ?? readGuard.fetch;
  const result = await withGlobalFetch(delegate, () => reader.read(options.request ?? fixture.request));
  active = readGuard.fetch;
  await withGlobalFetch(delegate, () => reader.close());
  return { result, logs };
}

const sorted = (values: readonly string[] | undefined): string[] | undefined =>
  values === undefined ? undefined : [...values].sort();

/** Rule 1: the descriptor equals the registry entry. */
export function checkDescriptor(reader: IHealthDataReader, entry: ReaderDescriptor): string[] {
  const violations: string[] = [];
  const actual = reader.descriptor;
  const fields = new Set([...Object.keys(entry), ...Object.keys(actual)]) as Set<keyof ReaderDescriptor>;
  for (const field of fields) {
    const want = entry[field];
    const got = actual[field];
    const same = Array.isArray(want) || Array.isArray(got) ? sameList(want, got) : want === got;

    if (!same) violations.push(`rule 1: descriptor.${field} differs from the registry entry`);
  }
  return violations;
}

function sameList(a: unknown, b: unknown): boolean {
  const left = Array.isArray(a) ? sorted(a as string[]) : a;
  const right = Array.isArray(b) ? sorted(b as string[]) : b;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Rule 2: `isThisType` accepts the reader's own fixture and makes no network call. */
export async function checkIsThisType(reader: IHealthDataReader, fixture: ConformanceFixture): Promise<string[]> {
  const guard = throwingFetch('isThisType');
  const violations: string[] = [];
  try {
    const accepted = await withGlobalFetch(guard.fetch, async () => reader.isThisType(fixture.input));

    if (!accepted) violations.push(`rule 2: isThisType rejected the fixture "${fixture.name}"`);
  } catch {
    violations.push('rule 2: isThisType threw; it must be side-effect free');
  }

  if (guard.calls() > 0) violations.push(`rule 2: isThisType called fetch ${guard.calls()} time(s)`);

  return violations;
}

/** Rule 3: `open` with an invalid input throws ConnectorError `validation`, operation `open`, quoting nothing. */
export async function checkOpenRejectsInvalid(
  factory: () => IHealthDataReader,
  invalidInput: ReaderInput,
  secrets: Record<string, string> = {}
): Promise<string[]> {
  const guard = throwingFetch('open');
  const violations: string[] = [];
  try {
    await withGlobalFetch(guard.fetch, () => factory().open(invalidInput, { fetch: guard.fetch }));
    violations.push('rule 3: open accepted an invalid input');
  } catch (error) {
    if (!(error instanceof ConnectorError)) {
      violations.push('rule 3: open threw something other than ConnectorError on an invalid input');
    } else {
      if (error.code !== 'validation') violations.push(`rule 3: open threw code "${error.code}", not "validation"`);
      if (error.operation !== 'open') violations.push(`rule 3: open threw operation "${error.operation}", not "open"`);
    }

    const serialised = `${String(error)} ${JSON.stringify((error as { cause?: unknown }).cause ?? '')}`;
    violations.push(...leaks(serialised, secrets).map((what) => `rule 3: the open error carries ${what}`));
  }

  if (guard.calls() > 0) violations.push(`rule 3: open called fetch ${guard.calls()} time(s)`);

  return violations;
}

/** Rule 3, second half: `open` on a valid fixture never fetches. */
export async function checkOpenDoesNotFetch(
  factory: () => IHealthDataReader,
  fixture: ConformanceFixture
): Promise<string[]> {
  const guard = throwingFetch('open');
  const violations: string[] = [];
  try {
    await withGlobalFetch(guard.fetch, () => factory().open(fixture.input, { ...fixture.host, fetch: guard.fetch }));
  } catch {
    violations.push(`rule 3: open threw on the fixture "${fixture.name}"`);
  }

  if (guard.calls() > 0) violations.push(`rule 3: open called fetch ${guard.calls()} time(s)`);

  return violations;
}

/** Rule 4: the bundle passes the injected validator with no error. */
export function checkValidates(bundle: Bundle, validate: FhirBundleValidator): string[] {
  const outcome = validate(bundle);
  const errors = outcome.issues.filter((issue) => issue.severity === 'error' || issue.severity === 'fatal');
  const violations = errors.map((issue) => `rule 4: ${issue.expression ?? '(no path)'}: ${issue.message}`);

  if (!outcome.ok && violations.length === 0) violations.push('rule 4: the validator reported the bundle as not ok');

  return violations;
}

function hasValue(element: object): boolean {
  return Object.keys(element).some((key) => key.startsWith('value'));
}

function checkQuantity(quantity: Quantity | undefined, where: string, violations: string[]): void {
  if (!quantity) return;

  if (quantity.system !== SYSTEMS.UCUM) violations.push(`rule 5: ${where}.valueQuantity.system is not UCUM`);

  if (!quantity.code) violations.push(`rule 5: ${where}.valueQuantity has no UCUM code`);

  if (!quantity.unit) violations.push(`rule 5: ${where}.valueQuantity has no unit`);
}

/** Rule 5: every Observation is tagged, linked per D1, identified per D2, in UCUM, and says why a value is absent. */
export function checkObservations(bundle: Bundle, descriptor: ReaderDescriptor, request: ReadRequest): string[] {
  const violations: string[] = [];
  const patients = new Set<string>();
  const observations: Array<{ index: number; observation: Observation }> = [];
  for (const [index, entry] of (bundle.entry ?? []).entries()) {
    if (entry.resource?.resourceType === 'Patient' && entry.fullUrl) patients.add(entry.fullUrl);

    if (isObservation(entry.resource)) observations.push({ index, observation: entry.resource });
  }

  if (observations.length === 0) violations.push('rule 5: the bundle carries no Observation');

  for (const { index, observation } of observations) {
    const where = `Bundle.entry[${index}]`;

    if (!observation.id || !UUID.test(observation.id)) violations.push(`rule 5: ${where} id is not a UUID (D2)`);

    const tag = observation.meta?.tag?.find((t) => t.system === CONNECTOR_TAG_SYSTEM);

    if (!tag) violations.push(`rule 5: ${where} has no connector meta tag`);
    else {
      if (tag.code !== descriptor.id) violations.push(`rule 5: ${where} connector tag is not "${descriptor.id}"`);
      if (tag.version !== descriptor.version) violations.push(`rule 5: ${where} connector tag version differs`);
    }

    const subject = observation.subject?.reference;

    if (request.subject) {
      if (subject !== request.subject.reference) violations.push(`rule 5: ${where} subject is not the caller's (D1)`);
    } else if (!subject?.startsWith('urn:uuid:')) {
      violations.push(`rule 5: ${where} subject is not a urn:uuid reference (D1)`);
    } else if (!patients.has(subject)) {
      violations.push(`rule 5: ${where} subject points at no Patient entry in the bundle (D1)`);
    }

    const valued = hasValue(observation);
    const panel = (observation.component?.length ?? 0) > 0;

    if (!valued && !observation.dataAbsentReason && !panel)
      violations.push(`rule 5: ${where} has neither a value nor dataAbsentReason`);

    if (valued && observation.dataAbsentReason)
      violations.push(`rule 5: ${where} has both a value and dataAbsentReason`);

    checkQuantity(observation.valueQuantity, where, violations);

    for (const [c, component] of (observation.component ?? []).entries()) {
      const at = `${where}.component[${c}]`;
      const componentValued = hasValue(component);

      if (!componentValued && !component.dataAbsentReason)
        violations.push(`rule 5: ${at} has neither a value nor dataAbsentReason`);

      if (componentValued && component.dataAbsentReason)
        violations.push(`rule 5: ${at} has both a value and dataAbsentReason`);

      checkQuantity(component.valueQuantity, at, violations);
    }
  }
  return violations;
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
export async function checkDeterminism(
  factory: () => IHealthDataReader,
  fixture: ConformanceFixture,
  now: string
): Promise<string[]> {
  const violations: string[] = [];
  const first = await runFixture(factory, fixture, { now });
  const second = await runFixture(factory, fixture, { now });

  if (JSON.stringify(first.result.bundle) !== JSON.stringify(second.result.bundle)) {
    violations.push('rule 6: two reads with the same request and clock gave different bundles');
  }

  if (fixture.request.window) {
    const shifted = await runFixture(factory, fixture, {
      now,
      request: { ...fixture.request, window: shiftWindow(fixture.request.window) }
    });
    if (shifted.result.bundle.id === first.result.bundle.id) {
      violations.push('rule 6: two requests with different windows share one Bundle.id');
    }
  }

  return violations;
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
export function checkNoLeak(run: FixtureRun, secrets: Record<string, string> = {}): string[] {
  const violations: string[] = [];
  const { issues, provenance } = run.result;
  for (const what of leaks(JSON.stringify(issues), secrets)) violations.push(`rule 7: an issue carries ${what}`);
  for (const what of leaks(JSON.stringify(provenance), secrets))
    violations.push(`rule 7: the provenance carries ${what}`);
  for (const what of leaks(JSON.stringify(run.logs), secrets)) violations.push(`rule 7: a log line carries ${what}`);
  return violations;
}

/** Rule 8: the bundle's summary equals expected.json. */
export function checkExpected(bundle: Bundle, expected: ExpectedSummary): string[] {
  return diffSummary(expected, summarise(bundle)).map((line) => `rule 8: ${line}`);
}
