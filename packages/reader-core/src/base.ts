/**
 * WHAT: HealthDataReader and OAuthReader, the shared implementations adapters extend, plus the small helpers every adapter needs: file text, config parsing, issue mapping, subject, bundle key, fetchJson, host stores.
 * NOT:  Does not map any vendor format and persists nothing itself; tokens and cursors go through the host stores (D8).
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6; DECISIONS.md#d8
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: an error never carries a body, a URL or a raw cause: a fetch rejection names the URL and a JSON parse error quotes the body, and loggers serialise `cause`.
 */
import { readFileSync } from 'node:fs';
import {
  buildBundle,
  CONNECTOR_TAG_SYSTEM,
  ConnectorError,
  type ConnectorErrorCode,
  connectorMeta,
  fromHttpStatus,
  minimalPatient,
  parseRetryAfter,
  subjectReference
} from '@open-twin/fhir-core';
import type { Bundle, FhirResource, OperationOutcomeIssue, Patient, Reference } from 'fhir/r4';
import type { IHealthDataReader } from './reader';
import type {
  HostServices,
  Issue,
  ReaderDescriptor,
  ReaderInput,
  ReaderMetadata,
  ReadProvenance,
  ReadRequest,
  ReadResult,
  StoredTokens
} from './types';

/** The Foundation-controlled identifier namespace for a reader, as `SYSTEMS.*_IDENTIFIER` spells it (D2). */
export function subjectIdentifierSystem(readerId: string): string {
  return `http://opentwin.ch/fhir/sid/${readerId}`;
}

/** The text of a file input: inline text, decoded bytes, or the file at `path`. Undefined for an api input or an unreadable path. */
export function fileText(input: ReaderInput): string | undefined {
  if (input.kind !== 'file') return undefined;

  if (input.text !== undefined) return input.text;

  if (input.bytes) return new TextDecoder().decode(input.bytes);

  if (!input.path) return undefined;

  try {
    return readFileSync(input.path, 'utf8');
  } catch {
    return undefined;
  }
}

/** `fileText` parsed as JSON; undefined when there is no text or it is not JSON. */
export function fileJson(input: ReaderInput): unknown {
  const text = fileText(input);

  if (text === undefined) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Maps a vendor OperationOutcome issue to a reader issue. Diagnostics from the connectors carry no payload. */
export function issueFromOutcome(issue: OperationOutcomeIssue): Issue {
  return {
    severity: issue.severity === 'fatal' ? 'error' : issue.severity,
    code: issue.code,
    details: issue.diagnostics ?? 'The vendor reported a problem with one requested type.'
  };
}

/** The part of a zod schema the helpers need. Structural, so any schema library fits. */
export interface Parser<T> {
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[] }> } };
}

/** The offending fields of a failed parse, for an error message that names them and never their values. */
export function failedPaths(error: { issues: Array<{ path: PropertyKey[] }> }): string {
  return error.issues.map((issue) => issue.path.map(String).join('.') || '(root)').join(', ');
}

/** Only the error's class name survives as a cause. */
function safeCause(cause: unknown): string | undefined {
  if (cause === undefined) return undefined;

  return cause instanceof Error ? cause.name : typeof cause;
}

export interface SubjectResolution {
  reference: Reference;
  /** Present only when the caller supplied no reference: the Patient entry the bundle must carry (D1). */
  patient?: Patient;
}

export interface BundleFromOptions {
  resources: FhirResource[];
  bundleKey: string;
  timestamp?: string;
  type?: 'collection' | 'transaction';
}

export abstract class HealthDataReader implements IHealthDataReader {
  abstract readonly descriptor: ReaderDescriptor;

  protected input: ReaderInput | undefined;
  protected host: HostServices = {};

  /** API readers match their id; file readers override this with a content sniff. */
  isThisType(input: ReaderInput): Promise<boolean> | boolean {
    return input.kind === 'api' && input.sourceId === this.descriptor.id;
  }

  async open(input: ReaderInput, host: HostServices = {}): Promise<void> {
    this.host = host;
    await this.onOpen(input);
    this.input = input;
  }

  /** Validate the config and restore state here. Throw `validation` on a bad input. */
  protected onOpen(_input: ReaderInput): Promise<void> {
    return Promise.resolve();
  }

  abstract describe(): Promise<ReaderMetadata>;

  abstract read(request: ReadRequest): Promise<ReadResult>;

  async close(): Promise<void> {
    await this.onClose();
  }

  /** Persist changed tokens or a cursor here. Must be idempotent. */
  protected onClose(): Promise<void> {
    return Promise.resolve();
  }

  /** The state `onOpen` set, or `validation` when `read` runs before `open`. */
  protected opened<T>(state: T | undefined): T {
    if (state === undefined) throw this.fail('read called before open', 'validation', 'read');

    return state;
  }

  /** The config parsed by `schema`, or `validation` naming the failed fields and never their values. */
  protected parseConfig<T>(schema: Parser<T>, config: unknown): T {
    const parsed = schema.safeParse(config);

    if (parsed.success) return parsed.data;

    throw this.fail(
      `The ${this.descriptor.id} reader config is invalid at: ${failedPaths(parsed.error)}`,
      'validation',
      'open'
    );
  }

  /** ISO timestamp from the host clock. */
  protected now(): string {
    return this.host.now?.() ?? new Date().toISOString();
  }

  /** D1: the caller's reference verbatim, else a deterministic `urn:uuid:` plus the Patient the bundle must carry. */
  protected subjectFor(request: ReadRequest): SubjectResolution {
    const { id } = this.descriptor;
    const reference = subjectReference({ reference: request.subject, connector: id, subjectKey: request.subjectKey });

    if (request.subject) return { reference };

    return {
      reference,
      patient: minimalPatient({
        connector: id,
        subjectKey: request.subjectKey,
        identifierSystem: subjectIdentifierSystem(id)
      })
    };
  }

  /** One key per request: reader, subject, sorted types and window, so two windows never share a Bundle.id. */
  protected bundleKeyFor(request: ReadRequest): string {
    const types = [...(request.types ?? this.descriptor.dataTypes)].sort().join(',');
    return [this.descriptor.id, request.subjectKey, types, request.window?.start ?? '', request.window?.end ?? ''].join(
      '|'
    );
  }

  /** D2: a bundle whose id and entry ids are stable for the same key. */
  protected bundleFrom(options: BundleFromOptions): Bundle {
    return buildBundle({
      connector: { connector: this.descriptor.id, version: this.descriptor.version },
      resources: options.resources,
      timestamp: options.timestamp ?? this.now(),
      bundleKey: options.bundleKey,
      type: options.type
    });
  }

  /**
   * The bundle with this reader's connector tag on every entry. For providers whose
   * mappers tag the Bundle only: rule 5 wants every Observation traceable on its own.
   * A tag with the same code is replaced, so the version is this reader's.
   */
  protected withConnectorTag(bundle: Bundle): Bundle {
    const tag = connectorMeta({ connector: this.descriptor.id, version: this.descriptor.version }).tag ?? [];
    const entry = (bundle.entry ?? []).map((item) => {
      if (!item.resource) return item;

      const others = (item.resource.meta?.tag ?? []).filter(
        (t) => !(t.system === CONNECTOR_TAG_SYSTEM && t.code === this.descriptor.id)
      );
      const meta = { ...(item.resource.meta ?? {}), tag: [...others, ...tag] };
      return { ...item, resource: { ...item.resource, meta } as FhirResource };
    });
    return { ...bundle, entry };
  }

  protected provenanceFor(
    bundle: Bundle,
    source: ReaderMetadata['source'] = { id: this.descriptor.id },
    fixture?: ReadProvenance['fixture']
  ): ReadProvenance {
    const provenance: ReadProvenance = {
      reader: { id: this.descriptor.id, version: this.descriptor.version },
      retrievedAt: bundle.timestamp ?? this.now(),
      source,
      recordCount: bundle.entry?.length ?? 0
    };

    if (fixture) provenance.fixture = fixture;

    return provenance;
  }

  /**
   * GET JSON through the host fetch, parsed with `schema`. Failures become `ConnectorError`
   * by status, `transport` on a network error, `validation` when the body is not JSON or
   * does not match. The body is never quoted and the URL never logged.
   */
  protected async fetchJson<T>(url: string, schema: Parser<T>, operation: string): Promise<T> {
    const fetchImpl = this.host.fetch ?? globalThis.fetch;
    const { id } = this.descriptor;
    this.host.logger?.debug('request', { reader: id, operation });

    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    } catch (cause) {
      throw this.fail('The request could not be completed', 'transport', operation, cause);
    }

    if (!response.ok) {
      const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'), Date.now());
      throw fromHttpStatus(response.status, { connector: id, operation, retryAfterSeconds });
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw this.fail('The response was not JSON', 'validation', operation, cause);
    }
    const parsed = schema.safeParse(json);

    if (!parsed.success) throw this.fail('The response did not match the expected schema', 'validation', operation);

    return parsed.data;
  }

  protected loadTokens(key: string): Promise<StoredTokens | undefined> {
    return this.host.tokenStore?.load(key) ?? Promise.resolve(undefined);
  }

  protected saveTokens(key: string, tokens: StoredTokens): Promise<void> {
    return this.host.tokenStore?.save(key, tokens) ?? Promise.resolve();
  }

  protected loadCursor(key: string): Promise<string | undefined> {
    return this.host.cursorStore?.load(key) ?? Promise.resolve(undefined);
  }

  protected saveCursor(key: string, cursor: string): Promise<void> {
    return this.host.cursorStore?.save(key, cursor) ?? Promise.resolve();
  }

  /** An issue for the result. `details` explains the condition and never quotes the source. */
  protected issue(severity: Issue['severity'], code: string, details: string, path?: string): Issue {
    const issue: Issue = { severity, code, details };

    if (path !== undefined) issue.path = path;

    return issue;
  }

  /** A `ConnectorError` for this reader. The message explains; only the cause's class name is kept. */
  protected fail(message: string, code: ConnectorErrorCode, operation: string, cause?: unknown): ConnectorError {
    return new ConnectorError(message, { code, connector: this.descriptor.id, operation, cause: safeCause(cause) });
  }
}

/** What the vendor token handlers (Oura, WHOOP) already expose. */
export interface OAuthTokenBridge {
  setTokens(
    tokens: { access_token: string; refresh_token: string; expires_in: number; token_type: 'bearer' },
    expiresAt?: number
  ): void;
  getTokens(): { tokens: { access_token: string; refresh_token?: string }; expiresAt: number } | undefined;
  /** Exchanges the authorization code the handler was built with. */
  authenticate(): Promise<void>;
}

/**
 * An API reader behind OAuth 2.0: the config is parsed in the reader, a per-wearer
 * `tokenKey` is required with no default (wearers can share one client), tokens are
 * restored from the host store at open and saved at close, and a code is exchanged
 * when given and nothing is stored.
 */
export abstract class OAuthReader<C> extends HealthDataReader {
  protected abstract readonly configSchema: Parser<C>;
  protected abstract tokenHandlerFor(config: C, authorizationCode: string): OAuthTokenBridge;

  protected config: C | undefined;
  protected tokens: OAuthTokenBridge | undefined;
  private tokenKey: string | undefined;

  protected override async onOpen(input: ReaderInput): Promise<void> {
    if (input.kind !== 'api' || input.sourceId !== this.descriptor.id) {
      throw this.fail(`An api input with sourceId "${this.descriptor.id}" is required`, 'validation', 'open');
    }

    const config = this.parseConfig(this.configSchema, input.config);

    if (!input.tokenKey)
      throw this.fail('A per-wearer tokenKey is required; there is no default', 'validation', 'open');

    const tokens = this.tokenHandlerFor(config, input.authorizationCode ?? '');

    const stored = await this.loadTokens(input.tokenKey);

    if (stored) {
      tokens.setTokens(
        {
          access_token: stored.accessToken,
          refresh_token: stored.refreshToken ?? '',
          expires_in: 0,
          token_type: 'bearer'
        },
        Date.parse(stored.expiresAt)
      );
    } else if (input.authorizationCode) {
      await tokens.authenticate();
    }

    this.config = config;
    this.tokens = tokens;
    this.tokenKey = input.tokenKey;
  }

  protected override async onClose(): Promise<void> {
    const current = this.tokens?.getTokens();

    if (!current || !this.tokenKey) return;

    await this.saveTokens(this.tokenKey, {
      accessToken: current.tokens.access_token,
      refreshToken: current.tokens.refresh_token,
      expiresAt: new Date(current.expiresAt).toISOString()
    });
  }
}
