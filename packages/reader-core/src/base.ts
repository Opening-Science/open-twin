/**
 * WHAT: HealthDataReader, the shared implementation every reader adapter extends: lifecycle, config parsing, subject (D1), bundle key (D2), fetchJson and the host stores.
 * NOT:  Does not map any vendor format and persists nothing itself; tokens and cursors go through the host stores (D8). One instance serves one connection.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6; DECISIONS.md#d8
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: an error never carries a body, a URL or a raw cause: a fetch rejection names the URL and a JSON parse error quotes the body, and loggers serialise `cause`.
 */
import {
  ConnectorError,
  type ConnectorErrorCode,
  fromHttpStatus,
  minimalPatient,
  parseRetryAfter,
  subjectReference
} from '@open-twin/fhir-core';
import type { Bundle, Patient, Reference } from 'fhir/r4';
import type { IHealthDataReader } from './reader';
import type {
  HostServices,
  Issue,
  Logger,
  ReaderDescriptor,
  ReaderInput,
  ReaderMetadata,
  ReadProvenance,
  ReadRequest,
  ReadResult,
  StoredTokens
} from './types';
import { causeClassName } from './utils/errorCause';
import { failedFieldPaths, type Parser } from './utils/parser';
import { subjectIdentifierSystem } from './utils/subject';

const SILENT: Logger = { debug: () => undefined, warn: () => undefined };

export interface SubjectResolution {
  reference: Reference;
  /** Only when the caller gave no reference: the Patient the minted `urn:uuid:` points at (D1). */
  patient?: Patient;
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
    if (this.input !== undefined) {
      throw this.fail('The reader is already open; use one instance per connection', 'validation', 'open');
    }

    this.host = host;

    try {
      await this.onOpen(input);
    } catch (error) {
      this.host = {};
      throw error;
    }

    this.input = input;
  }

  /** Validate the config and restore state. Throw `validation` on a bad input; never fetch health data. */
  protected abstract onOpen(input: ReaderInput): Promise<void>;

  abstract describe(): Promise<ReaderMetadata>;

  abstract read(request: ReadRequest): Promise<ReadResult>;

  async close(): Promise<void> {
    await this.onClose();
    this.input = undefined;
  }

  /** Persist changed tokens or a cursor. Runs on every close, so it must be idempotent. */
  protected abstract onClose(): Promise<void>;

  protected get connector(): { connector: string; version: string } {
    return { connector: this.descriptor.id, version: this.descriptor.version };
  }

  protected get logger(): Logger {
    return this.host.logger ?? SILENT;
  }

  /** The config parsed by `schema`, or `validation` naming the failed fields and never their values. */
  protected parseConfig<T>(schema: Parser<T>, config: unknown): T {
    const parsed = schema.safeParse(config);

    if (parsed.success) return parsed.data;

    throw this.fail(
      `The ${this.descriptor.id} reader config is invalid at: ${failedFieldPaths(parsed.error)}`,
      'validation',
      'open'
    );
  }

  protected now(): string {
    return this.host.now?.() ?? new Date().toISOString();
  }

  /** D1: the caller's reference as given; otherwise a minted `urn:uuid:` and the Patient it points at. */
  protected subjectFor(request: ReadRequest): SubjectResolution {
    if (request.subject) return { reference: request.subject };

    const { id } = this.descriptor;
    return {
      reference: subjectReference({ connector: id, subjectKey: request.subjectKey }),
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
    this.logger.debug('request', { reader: id, operation });

    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    } catch (cause) {
      throw this.fail('The request could not be completed', 'transport', operation, cause);
    }

    if (!response.ok) {
      await response.body?.cancel();
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

  protected async loadTokens(key: string): Promise<StoredTokens | undefined> {
    return await this.host.tokenStore?.load(key);
  }

  protected async saveTokens(key: string, tokens: StoredTokens): Promise<void> {
    await this.host.tokenStore?.save(key, tokens);
  }

  protected async loadCursor(key: string): Promise<string | undefined> {
    return await this.host.cursorStore?.load(key);
  }

  protected async saveCursor(key: string, cursor: string): Promise<void> {
    await this.host.cursorStore?.save(key, cursor);
  }

  /** An issue for the result. `details` explains the condition and never quotes the source. */
  protected issue(severity: Issue['severity'], code: string, details: string, path?: string): Issue {
    const issue: Issue = { severity, code, details };

    if (path !== undefined) issue.path = path;

    return issue;
  }

  /** A `ConnectorError` for this reader. The message explains; only the cause's class name is kept. */
  protected fail(message: string, code: ConnectorErrorCode, operation: string, cause?: unknown): ConnectorError {
    return new ConnectorError(message, {
      code,
      connector: this.descriptor.id,
      operation,
      cause: causeClassName(cause)
    });
  }
}
