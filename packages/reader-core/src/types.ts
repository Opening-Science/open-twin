/**
 * WHAT: The data types every reader shares: descriptor, metadata, host services, request and result.
 * NOT:  Does not define behaviour; the interface is in reader.ts and the helpers in base.ts.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d8; DECISIONS.md#d1; DECISIONS.md#d2
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: ReaderMetadata, Issue and ReadProvenance travel into logs. None may carry a health payload, a token, a name or an e-mail; conformance rule 7 checks serialised issues for that.
 */
import type { Bundle, Reference } from 'fhir/r4';

export const DATA_DOMAINS = ['wearable', 'body-scan', 'lab', 'clinical-record', 'genomics', 'synthetic'] as const;
export const READER_KINDS = ['api', 'file'] as const;
export const AUTH_KINDS = ['oauth2', 'basic', 'bearer', 'none'] as const;

export type DataDomain = (typeof DATA_DOMAINS)[number];
export type ReaderKind = (typeof READER_KINDS)[number];
export type AuthKind = (typeof AUTH_KINDS)[number];

/** Static facts about a reader. Must equal its entry in registry/connectors.json (conformance rule 1). */
export interface ReaderDescriptor {
  id: string;
  name: string;
  version: string;
  kind: ReaderKind;
  domains: DataDomain[];
  dataTypes: string[];
  auth: AuthKind;
  /** Sniffing decides, never the suffix alone. */
  suffixes?: string[];
  mediaTypes?: string[];
  vendorDocs?: string;
}

export interface ReaderMetadata {
  /** `endpoint` is the host only, never a path. */
  source: { id: string; apiVersion?: string; endpoint?: string };
  subjects?: { subjectKey: string }[];
  dataTypes: string[];
  window?: { earliest?: string; latest?: string };
  capabilities: { incremental: boolean; sandbox: boolean; write: boolean };
}

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
}

/** D8: implemented by the host, never by the library. */
export interface TokenStore {
  load(key: string): Promise<StoredTokens | undefined>;
  save(key: string, tokens: StoredTokens): Promise<void>;
  clear(key: string): Promise<void>;
}

/** D8: the incremental sync position, implemented by the host. */
export interface CursorStore {
  load(key: string): Promise<string | undefined>;
  save(key: string, cursor: string): Promise<void>;
}

/** Receives operation names and counts only. Never a payload, a token or an identifier. */
export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}

export interface HostServices {
  tokenStore?: TokenStore;
  cursorStore?: CursorStore;
  /** Used by the base-class helpers. The wrapped providers still call the global fetch (spec section 11). */
  fetch?: typeof fetch;
  now?: () => string;
  logger?: Logger;
}

export type ReaderInput =
  | {
      kind: 'api';
      sourceId: string;
      config: unknown;
      authorizationCode?: string;
      /** One key per wearer. Never the OAuth client id: two wearers on one client would share tokens. */
      tokenKey?: string;
    }
  | { kind: 'file'; name?: string; mediaType?: string; path?: string; bytes?: Uint8Array; text?: string };

export interface ReadRequest {
  /** The vendor user id or a stable pseudonymous key (D1, D2). Never an e-mail address. */
  subjectKey: string;
  /** Caller-supplied Patient reference. Absent: the reader mints `urn:uuid:` and a Patient entry (D1). */
  subject?: Reference;
  /** ISO 8601 with offset. The offset is kept, never normalised to UTC (D7). */
  window?: { start: string; end: string };
  /** Absent means all of `descriptor.dataTypes`. */
  types?: string[];
  cursor?: string;
  limit?: number;
}

export interface Issue {
  severity: 'error' | 'warning' | 'information';
  code: string;
  /** Explains the condition. Contains no data from the source. */
  details: string;
  path?: string;
}

export interface ReadProvenance {
  reader: { id: string; version: string };
  retrievedAt: string;
  source: ReaderMetadata['source'];
  recordCount: number;
  fixture?: { path: string; provenance: string };
}

export interface ReadResult {
  bundle: Bundle;
  issues: Issue[];
  cursor?: string;
  provenance: ReadProvenance;
}
