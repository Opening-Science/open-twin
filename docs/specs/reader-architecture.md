# Reader architecture: implementation specification

**Status:** draft 0.2, 2 November 2026. Based on Martin Etzrodt's draft 0.1, with corrections
against `main` (section 11) and aggregate as the phase 1 hand-off to twin-llm.
**Owner:** Martin Etzrodt. **Maintainer:** Peter Dike.
**Governs:** the reader interface, the connector registry, the delegating reader and CLI,
the reconciling hand-off to twin-llm, and (phase 2) connector measurements reaching
open-twin-xr.

Sections 1 to 3 explain the idea. Sections 4 to 8 are the contract to build against.
Section 9 is the work breakdown, section 10 the decisions a maintainer must confirm first,
and section 11 lists where draft 0.1 differed from the code.

---

## 0. How to work on this spec

1. Read first: `README.md`, `DECISIONS.md` (D1 to D15), `docs/CONVENTIONS.md`,
   `Contributing.md`, `docs/00-MAP.md`, `packages/fhir-core/README.md`, `verify/run-verify.ts`.
2. Issue first, one component per issue (section 9), branch `<issue-number>-<slug>` from
   `main`, one concern per pull request, PR description in at most 10 lines.
3. Toolchain: Node 22, pnpm 11.17.0. `pnpm install --frozen-lockfile`, then
   `pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm verify`, then
   `pnpm ci:local` (JDK 21 for the HL7 validator) before opening a PR.
4. Every exporting module under `packages/*/src/` opens with the header block from
   `docs/CONVENTIONS.md`. `GOVERNED BY` points at a file or a `DECISIONS.md#dn` anchor that
   exists. New decisions D16 and D17 are added to `DECISIONS.md` in the PR that first cites them.
5. Never invent a terminology code or unit; use `SYSTEMS.*` and `UCUM.*` from
   `@open-twin/fhir-core`. Never put real participant data, tokens or vendor response bodies
   into fixtures, logs, errors, tests or PRs. Fixtures carry a `PROVENANCE.md`.
6. Do not change the semantics of D1 to D15. Do not remove or rename a public export in
   phase 1; adapters wrap the existing functions. No copyleft dependencies. Tests run
   offline; live API tests need `OPEN_TWIN_LIVE=1` and are skipped by default.

---

## 1. Why: what is missing today

The repository has nine ingestion packages, `@open-twin/fhir-core` (which settles identity,
ids, code systems, units and provenance once, D1 to D4), verification gates under
`verify/`, `@open-twin/aggregate`, and an interpretation layer whose output open-twin-xr
renders. What it does not have:

| Missing                                             | Today                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A common reader interface** (`IHealthDataReader`) | Each package has its own entry point: `getFhirBundleFromOuraData`, `getFhirBundleFromWhoopData`, `getFhirBundleFromGoogleHealthData`, `getFhirBundleFromVitronicData`, `buildOpenWearablesBundle`, `normaliseBundle` (fhir-r4), `convertMessage` (hl7v2), `vcfToFhirBundle`, `buildCollectionBundle` (provider-anchor). Two near-identical `TokenHandler` classes exist (Oura, WHOOP). D8 names `TokenStore` and `CursorStore`, but they exist only in prose. |
| **A connector registry**                            | The README package table (hand-written), `pnpm-workspace.yaml` and `verify/bundles.manifest.ts`. Nothing is machine-readable and nothing checks that the three agree.                                                                                                                                                                                                                                                                                         |
| **One hand-off for consumers**                      | twin-llm calls each connector directly, keeps one bundle per connection and never uses `@open-twin/aggregate`. Cross-source reconciliation exists but nothing downstream uses it.                                                                                                                                                                                                                                                                             |
| **A path for connector data into the twin**         | `interpretation-contract` v0.2 carries per-system _states_ derived from lab biomarkers keyed on `biomarker_id`. There is no slot for wearable or body-scan measurements, so Oura, Google Health and VITRONIC output never reaches open-twin-xr.                                                                                                                                                                                                               |

The fix is not a rewrite. It puts the Bio-Formats pattern on top of what exists: a reader
interface, a registry, a delegating reader, wrappers (aggregate first), writers and a
tool, with FHIR R4 through `fhir-core` as the single output model.

---

## 2. The Bio-Formats model and its open-twin equivalents

Bio-Formats (Open Microscopy Environment) reads more than 150 microscopy formats through one
API. Every format is a reader behind one interface; readers are listed in a registry in
priority order; a delegating reader detects the format and hands over; every reader writes
into one metadata model (OME-XML); decorators add behaviour without touching readers;
writers export from the common model; and a few tools (`showinf`, `bfconvert`, `xmlvalid`)
make it inspectable. Tests are data-driven: each sample carries a config with expected values.

| Bio-Formats                                                                       | open-twin equivalent                                                                                        | Where                                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `IFormatReader` (`isThisType`, `setId`, `openBytes`, `getMetadataStore`, `close`) | `IHealthDataReader` (`isThisType`, `open`, `describe`, `read`, `close`)                                     | `packages/reader-core/src/reader.ts`                            |
| `FormatReader` base class                                                         | `HealthDataReader`: subject (D1), ids (D2), bundle building, error hygiene, token and cursor stores         | `packages/reader-core/src/base.ts`                              |
| `readers.txt`                                                                     | `registry/connectors.json` (ordered, schema-validated) and its loader                                       | `registry/`, `reader-core/src/registry.ts`                      |
| `ImageReader` (delegator)                                                         | `OpenTwinReader`: files by content sniffing, APIs by `sourceId`                                             | `reader-core/src/delegate.ts`                                   |
| OME-XML metadata model                                                            | `fhir-core` builders and the FHIR R4 target model, checked by the HL7 validator, UCUM and terminology gates | existing                                                        |
| `CoreMetadata`                                                                    | `ReaderMetadata`: subjects, data types, time window, API version, capabilities                              | `reader-core`                                                   |
| `ReaderWrapper` subclasses                                                        | `ReconcilingReader` (wraps `@open-twin/aggregate`), `ReferenceRangeReader` (wraps `anchor-layer`)           | `reader-core/src/wrappers/`                                     |
| `IFormatWriter`                                                                   | `IHealthDataWriter`: `FhirBundleWriter`, `TwinTargetWriter`                                                 | `reader-core/src/writer.ts`, `packages/twin-adapter`            |
| Domains                                                                           | `DataDomain`: `wearable`, `body-scan`, `lab`, `clinical-record`, `genomics`, `synthetic`                    | `reader-core`                                                   |
| `showinf`, `bfconvert`, `xmlvalid`                                                | `twin list`, `info`, `convert`, `validate`, `demo`                                                          | `packages/cli`                                                  |
| Generated "supported formats" table                                               | README and `docs/registry.md` tables generated from the registry; a gate fails on drift                     | `scripts/generate-registry-docs.ts`, `verify/check-registry.ts` |
| Data-driven tests                                                                 | `expected.json` beside each fixture, read by one shared harness                                             | `reader-core/src/testing/`                                      |

Two deliberate differences. Most open-twin connectors read APIs, not files, so
`isThisType` has two forms (content sniffing for files, source id for APIs) and `open`
takes host services, because the libraries stay stateless (D8). And readers return
immutable FHIR R4 bundles rather than filling a mutable store, because the validator, not
the reader, is the authority on correctness.

---

## 3. Target architecture

```
                 packages/cli  (twin list | info | convert | validate | demo)
                                 │ uses
   registry/connectors.json ──►  OpenTwinReader (delegator)
                                 │ opens
      ┌──────────┬───────────┬───┴──────┬───────────┬──────────┬─────────┬──────────┐
      │ oura     │ whoop     │ google-  │ vitronic  │ open-    │ fhir-r4 │ hl7v2 /  │  each: src/reader.ts
      │ (api)    │ (api)     │ health   │ (api)     │ wearables│ (file)  │ vcf /    │  extends HealthDataReader
      │          │           │ (api)    │           │ (file)   │         │ anchor   │
      └──────────┴───────────┴──────────┴───────────┴──────────┴─────────┴──────────┘
                                 │ every reader builds through
                 @open-twin/fhir-core: the FHIR R4 target model (HL7 validator + gates)
                                 │
                 ReconcilingReader → @open-twin/aggregate
                 (every source observation kept; reconciliations added; abstentions recorded)
                                 │
            phase 1 hand-off ────┼──── phase 2
                                 │                         │
                            twin-llm               twin-adapter → Twin Target
                     (one reconciled bundle)       (interpretation-contract v0.3
                                                    measurements[]) → open-twin-xr
```

Layer ownership stays as in D14: terminology, then ingestion (readers, registry, delegator,
fhir-core, aggregate), then interpretation (interpreter, twin-adapter, contract), then
geometry and XR (open-twin-xr). Consumers such as twin-llm take the reconciled bundle and
do not call connectors directly.

---

## 4. Interfaces (normative)

All types live in `packages/reader-core/src/` and are re-exported from
`@open-twin/reader-core`. FHIR types come from `fhir/r4`. **MUST** marks a requirement
checked by a test or a gate.

```ts
// packages/reader-core/src/types.ts
import type { Bundle, Reference } from 'fhir/r4';

export type DataDomain = 'wearable' | 'body-scan' | 'lab' | 'clinical-record' | 'genomics' | 'synthetic';
export type ReaderKind = 'api' | 'file';
export type AuthKind = 'oauth2' | 'basic' | 'bearer' | 'none';

/** Static facts about a reader. MUST equal the registry entry (verify/check-registry.ts). */
export interface ReaderDescriptor {
  id: string; // registry id, kebab-case; equals ConnectorVersion.connector in Bundle.meta.tag
  name: string;
  version: string; // the package.json version
  kind: ReaderKind;
  domains: DataDomain[];
  dataTypes: string[]; // request `types` this reader supports
  auth: AuthKind;
  suffixes?: string[]; // file readers
  mediaTypes?: string[]; // file readers
  vendorDocs?: string;
}

/** What a reader can see once opened. MUST NOT contain health payloads or names. */
export interface ReaderMetadata {
  source: { id: string; apiVersion?: string; endpoint?: string }; // endpoint host only
  subjects?: { subjectKey: string }[];
  dataTypes: string[];
  window?: { earliest?: string; latest?: string }; // ISO 8601 with offset
  capabilities: { incremental: boolean; sandbox: boolean; write: boolean };
}

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
}
export interface TokenStore {
  // D8: implemented by the host, never by the library
  load(key: string): Promise<StoredTokens | undefined>;
  save(key: string, tokens: StoredTokens): Promise<void>;
  clear(key: string): Promise<void>;
}
export interface CursorStore {
  // D8: incremental sync position, implemented by the host
  load(key: string): Promise<string | undefined>;
  save(key: string, cursor: string): Promise<void>;
}
export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}
export interface HostServices {
  tokenStore?: TokenStore;
  cursorStore?: CursorStore;
  fetch?: typeof fetch; // used by base-class helpers; see section 11 on the wrapped packages
  now?: () => string; // ISO timestamp supplier; readers pass it as the bundle timestamp
  logger?: Logger; // MUST never receive payloads, tokens or identifiers
}

export type ReaderInput =
  | { kind: 'api'; sourceId: string; config: unknown; authorizationCode?: string; tokenKey?: string }
  | { kind: 'file'; name?: string; mediaType?: string; path?: string; bytes?: Uint8Array; text?: string };

export interface ReadRequest {
  subjectKey: string; // vendor user id or stable pseudonymous key (D1, D2)
  subject?: Reference; // caller-supplied Patient reference; when absent the reader mints urn:uuid (D1)
  window?: { start: string; end: string };
  types?: string[]; // subset of descriptor.dataTypes; absent means all
  cursor?: string;
  limit?: number;
}

export interface Issue {
  severity: 'error' | 'warning' | 'information';
  code: string;
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
  bundle: Bundle; // built with fhir-core buildBundle
  issues: Issue[]; // MUST NOT contain payloads
  cursor?: string;
  provenance: ReadProvenance;
}
```

```ts
// packages/reader-core/src/reader.ts
export interface IHealthDataReader {
  readonly descriptor: ReaderDescriptor;

  /** File readers sniff content (never the suffix alone); API readers match input.sourceId.
   *  MUST be side-effect free and MUST NOT call the network. */
  isThisType(input: ReaderInput): Promise<boolean> | boolean;

  /** Validates config with zod, restores tokens or cursor through host stores.
   *  MUST throw ConnectorError code 'validation', operation 'open', on invalid config.
   *  MUST NOT fetch health data. */
  open(input: ReaderInput, host?: HostServices): Promise<void>;

  /** MUST NOT contain health payloads or names. */
  describe(): Promise<ReaderMetadata>;

  /** Retrieve or parse, and map to a FHIR R4 bundle through fhir-core.
   *  MUST: subject per D1; ids per D2; code systems per D3; units per D4; missing data as
   *  dataAbsentReason, never 0; source offsets kept (D7); connector meta tag on every
   *  Observation; errors as ConnectorError without bodies. */
  read(request: ReadRequest): Promise<ReadResult>;

  /** Persist changed tokens or cursor through host stores. Idempotent. */
  close(): Promise<void>;
}

export interface ReaderWrapper extends IHealthDataReader {
  readonly inner: IHealthDataReader | IHealthDataReader[];
}

export interface IHealthDataWriter {
  readonly descriptor: { id: string; version: string; formats: string[] };
  write(bundle: Bundle, target: WriteTarget): Promise<WriteResult>;
}
export type WriteTarget =
  | { kind: 'file'; path: string; format: 'json' | 'ndjson' }
  | { kind: 'fhir-server'; baseUrl: string; mode: 'transaction' } // D2 PUT Observation/<id> upsert
  | { kind: 'twin-target'; path?: string }; // phase 2, section 5.G
export interface WriteResult {
  written: number;
  issues: Issue[];
  location?: string;
}
```

`HealthDataReader` (`base.ts`) implements the default API `isThisType`, stores `input` and
`host` in `open`, and provides shared helpers built on `fhir-core`: `subjectFor`
(`subjectReference`, `minimalPatient`), `bundleFrom` (`buildBundle`, `connectorMeta`),
`fetchJson` (injected fetch, zod-parsed, `fromHttpStatus` on failure, never logs bodies),
`loadTokens` and `saveTokens` through `host.tokenStore`, and `issue`.

Errors use the existing `ConnectorError(message, { code, connector, operation })` from
`fhir-core/src/errors.ts`. Invalid config is `validation`; an input no reader accepts is
`unsupported`. No new codes are added.

### Conformance rules

Enforced by `reader-core/src/testing/conformance.ts`, a shared vitest suite each adapter
package imports:

1. `descriptor` equals the registry entry (id, version, kind, domains, dataTypes, auth).
2. `isThisType` is true for the reader's own fixtures and makes no network call (asserted
   with a throwing `fetch` stubbed on `globalThis`). For every other reader's fixtures the
   suite asserts that `OpenTwinReader` binds the expected reader by priority, not that
   `isThisType` is false, because `fhir-r4` accepts any FHIR Bundle.
3. `open` with an invalid config throws `ConnectorError` code `validation`; `open` never
   fetches health data.
4. `read` on the fixtures returns a bundle that passes `validateFhir` (fhir-r4), the UCUM
   gate and the terminology gate, and that the HL7 validator accepts with zero errors when
   registered in the verification manifest.
5. Every Observation has the connector meta tag, a subject reference per D1, a D2 id, a
   `UCUM.*` unit, and no zero-for-missing values.
6. Two `read` calls with the same request and the same `now` give byte-identical bundles,
   and two requests with different windows give different `Bundle.id`s.
7. No issue, error message or log line contains a response body, token, e-mail, name or
   vendor record payload (regex guard over serialised issues and a spying logger).
8. `expected.json` beside each fixture matches: counts per resource type and data type,
   first and last `effectiveDateTime`, and a SHA-256 of the sorted `Observation.code` set.

---

## 5. Components

### 5.A `@open-twin/reader-core` (new package)

Files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`, and under `src/`:
`index.ts`, `types.ts`, `reader.ts`, `base.ts`, `registry.ts`, `delegate.ts`, `writer.ts`,
`wrappers/wrapper.ts`, `testing/conformance.ts`, `testing/expected.ts`.
Dependencies: `@open-twin/fhir-core`, `@open-twin/fhir-r4` (validation in the conformance
suite), `@types/fhir`, `zod`. Built with tsup, ESM only, exports map as in
`provider-whoop/package.json`.

`DECISIONS.md` gains **D16, reader interface and registry**: every connector implements
`IHealthDataReader` through `HealthDataReader`; the registry is the single source of truth
for what exists; the delegator is the only place that chooses a reader; state lives in
host stores (restating D8). Trade-off: one more package in the build, and adapters double
the public surface during phase 1.

`testing/expected.ts` defines `ExpectedSummary` and `summarise(bundle)`. `conformance.ts`
exports `describeReaderConformance(readerFactory, fixtures)`, which runs rules 1 to 8.

Acceptance: the package builds; every conformance rule has a test that fails on a
deliberately wrong fake reader; headers pass; `docs/00-MAP.md` updated.

### 5.B Registry

`registry/connectors.schema.json` (JSON Schema 2020-12) and `registry/connectors.json`.
One entry per ingestion package:

```json
{
  "id": "oura",
  "package": "@open-twin/provider-oura",
  "export": "OuraReader",
  "name": "Oura Ring API v2",
  "kind": "api",
  "auth": "oauth2",
  "domains": ["wearable"],
  "dataTypes": [
    "personal_info",
    "daily_sleep",
    "sleep",
    "daily_activity",
    "daily_readiness",
    "heartrate",
    "workout",
    "daily_spo2",
    "daily_stress",
    "vo2_max",
    "cardiovascular_age",
    "daily_resilience",
    "session"
  ],
  "status": "must-have",
  "priority": 100,
  "maintainer": "github:CPD9",
  "docs": "packages/provider-oura/README.md",
  "fixtures": "packages/provider-oura/src/tests/fixtures",
  "fixturesProvenance": "packages/provider-oura/src/tests/fixtures/PROVENANCE.md",
  "verificationBundles": ["oura-sync", "oura-sandbox-real"]
}
```

| id                               | package                             | kind | domains                         | status       | priority |
| -------------------------------- | ----------------------------------- | ---- | ------------------------------- | ------------ | -------- |
| `oura`                           | `@open-twin/provider-oura`          | api  | wearable                        | must-have    | 100      |
| `google-health` (alias `fitbit`) | `@open-twin/provider-google-health` | api  | wearable                        | must-have    | 90       |
| `vitronic`                       | `@open-twin/provider-vitronic`      | api  | body-scan                       | must-have    | 80       |
| `whoop`                          | `@open-twin/provider-whoop`         | api  | wearable                        | nice-to-have | 70       |
| `open-wearables`                 | `@open-twin/open-wearables`         | file | wearable                        | nice-to-have | 60       |
| `hl7v2`                          | `@open-twin/hl7v2`                  | file | clinical-record, lab            | nice-to-have | 50       |
| `genomics-vcf`                   | `@open-twin/genomics-vcf`           | file | genomics                        | nice-to-have | 40       |
| `anchor`                         | `@open-twin/provider-anchor`        | file | lab                             | research     | 30       |
| `fhir-r4`                        | `@open-twin/fhir-r4`                | file | clinical-record, lab, synthetic | nice-to-have | 10       |

Rules: higher `priority` is asked first; generic readers (`fhir-r4`, which accepts any FHIR
Bundle) sit last. `id` equals the `connector` string already in `Bundle.meta.tag`, so
existing bundles stay traceable. `aliases` record naming history only (`fitbit`), never a
second id. `status` is one of `must-have`, `nice-to-have`, `research`, `deprecated`. Every
path in an entry must exist.

Loader `reader-core/src/registry.ts`: `loadRegistry(path?)` validates with zod (generated
from the JSON Schema, not written twice) and returns typed entries; `resolveReader(entry)`
imports `entry.package` and instantiates `entry.export`. Node only; the browser build
excludes `resolveReader`.

Gate `verify/check-registry.ts`, blocking in `run-verify.ts`: every ingestion-layer package
has an entry and vice versa; each resolved reader's `descriptor` equals its entry; `version`
equals package.json; every `verificationBundles` name exists in `verify/bundles.manifest.ts`;
every path exists; the README and `docs/registry.md` tables equal the output of
`scripts/generate-registry-docs.ts`.

Acceptance: the gate passes on main; adding a package without an entry fails `pnpm verify`
with a message naming the package; the generated README table replaces the hand-written one.

### 5.C Reader adapters

Each adapter is `packages/<pkg>/src/reader.ts`, exported as `<Name>Reader` and
`createReader()`, extending `HealthDataReader` and wrapping the existing functions without
changing them. Each adds `src/tests/reader.conformance.test.ts`, an `expected.json` per
fixture, a registry entry and a five-line "Reader API" section in the package README.
Adapters always pass `host.now()` as the bundle timestamp. OAuth readers (Oura, WHOOP, Google Health) require a
per-wearer `tokenKey` and throw `validation` without one; there is no default key, because
several wearers can share one OAuth client. A request window must carry an offset: date-based
APIs take their dates in the window's own offset and receive that offset (Oura `utc_offset`),
never a silent UTC.

| Package                | `isThisType`                                                         | `open`                                                                                                                                                                                                    | `read` wraps                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| provider-oura          | sourceId `oura`                                                      | zod-validate the config (own schema in `reader.ts`); restore tokens through `host.tokenStore` into `TokenHandler.setTokens`; exchange `authorizationCode` when present; `sandbox` is a reader config flag | `getFhirBundleFromOuraData(request, tokenHandler, { sandbox, subject, subjectKey, timestamp })`, which fetches and maps in one call                                                                                                |
| provider-whoop         | sourceId `whoop`                                                     | as Oura, bridging `TokenHandler.getTokens/setTokens`                                                                                                                                                      | `getFhirBundleFromWhoopData(window, tokenHandler, options)`; the window enters `bundleKey` (section 11)                                                                                                                            |
| provider-google-health | sourceId `google-health`; `fitbit` accepted with a deprecation issue | `new GoogleHealthClient(config)`, `initializeGoogleHealthClient`; `apiVersion: 'v4'`                                                                                                                      | `getFhirBundleFromGoogleHealthData`, following `nextPageToken`, exposing `cursor`; window enters `bundleKey`                                                                                                                       |
| provider-vitronic      | sourceId `vitronic`                                                  | `createBodyLoopClient` (password or token, TLS pin)                                                                                                                                                       | `getAvailableViatars`, `getViatar`, `getFhirBundleFromVitronicData(client, viatarId, scopes, { subject })`; `types` are scopes. `startScan` and `createProband` are exposed as a `VitronicRunner` with `capabilities.write = true` |
| open-wearables         | JSON matching the OpenWearables sync shape                           | parse with `parseOrThrow` and the exported zod schemas                                                                                                                                                    | `buildOpenWearablesBundle(sync, { subject, timestamp })`                                                                                                                                                                           |
| hl7v2                  | text starts with `MSH\|` after optional BOM or MLLP bytes            | none                                                                                                                                                                                                      | `convertMessage(raw, { subject, timestamp })`                                                                                                                                                                                      |
| genomics-vcf           | text starts with `##fileformat=VCF` (gunzip `.vcf.gz` first)         | none                                                                                                                                                                                                      | `vcfToFhirBundle(text, { subject, timestamp })`                                                                                                                                                                                    |
| provider-anchor        | lab JSON matching the marker-class fixture shape                     | none                                                                                                                                                                                                      | `buildCollectionBundle({ context, measurements, bundleTimestamp })`                                                                                                                                                                |
| fhir-r4                | JSON with `resourceType === 'Bundle'`                                | none                                                                                                                                                                                                      | `validateFhir`, then `normaliseBundle(input, { connector, subjectKey, timestamp, bundleKey })`                                                                                                                                     |

Acceptance per adapter: conformance suite green; registry entry; `twin info <fixture>`
names the right reader; the existing verification bundle still passes.

### 5.D Delegating reader and CLI

`OpenTwinReader` (`reader-core/src/delegate.ts`) is built from a registry. `open(input, host)`
tries readers in `priority` order and binds the first that accepts, otherwise throws
`ConnectorError` code `unsupported` naming the readers it asked. `describe`, `read` and
`close` delegate. For API inputs detection is exact on `sourceId`; for files it is content
sniffing in order.

`packages/cli` (`@open-twin/cli`, binary `twin`, Node 22):
- `twin list`: registered readers (id, kind, domains, status, data types).
- `twin info <file | --source id --config file.json>`: which reader accepts the input and its `describe()` output; no data.
- `twin convert <input...> --subject-key K [--window start,end] [--types a,b] [--reconcile] --to fhir|ndjson|twin --out path [--token-store dir] [--cursor-store dir]`: exit code 1 on any `error` issue. `--reconcile` reads every input through `ReconcilingReader`.
- `twin validate <bundle.json>`: `validateFhir`, UCUM and terminology gates, and the HL7 validator when `java` is present.
- `twin demo --fixtures`: the end-to-end run of section 7 on fixtures.

File-based `TokenStore` and `CursorStore` (`packages/cli/src/stores.ts`, JSON files with
mode 0600) are reference implementations for the CLI only. The CLI is documented in
`packages/cli/README.md` and `docs/registry.md`.

### 5.E Wrappers

**`ReconcilingReader(readers: IHealthDataReader[])`, phase 1.** Opens all inner readers,
reads the same request from each, and calls
`aggregate({ sources, subjectKey, timestamp: host.now() })`. It returns the aggregate bundle
(every source observation kept, reconciliations as added derived Observations) and reports
each `Reconciliation` as an `information` issue, abstentions included with their reason.
Errors that `aggregate` throws (no sources, more than one subject, a missing connector tag)
surface as `ConnectorError`. This is the hand-off twin-llm consumes.

**`ReferenceRangeReader(inner)`, phase 2.** Attaches Anchor-layer reference intervals
(`fhir-core` `referenceInterval`, `anchor-layer`) to lab Observations.

Both extend the wrapper base and pass the conformance suite with their inner fixtures.

### 5.F Writers (phase 3)

`FhirBundleWriter`: `file` (pretty JSON), `ndjson` (one resource per line), `fhir-server`
(transaction with `PUT Observation/<id>` per D2, injected fetch, never logs bodies). Tests
use a recorded exchange, not a live server.

### 5.G Twin Target: measurements reaching open-twin-xr (phase 2)

**D17, Twin Target for measurements:** `interpretation-contract` moves to **v0.3** with a
top-level `measurements[]` carrying _displayed_ connector values, separate from `states[]`,
which stay the only _interpreted_ output. Wearable and scan data are never scored into
severity (D13); they are shown with source and reliability. `SystemId` is unchanged (D12).

Schema additions (`docs/contracts/interpretation-contract.v0.3.schema.json`, copied into the
package and typed by `scripts/generate-interpretation-contract.ts` as today; a
`docs/contracts/CHANGELOG.md` entry; v0.2 stays accepted for one release):

```json
"measurements": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["system_id", "measure", "value", "unit", "effective", "source", "reliability"],
    "properties": {
      "system_id":   { "$ref": "#/$defs/SystemId" },
      "measure":     { "type": "object", "required": ["system", "code", "display"] },
      "value":       { "type": "number" },
      "unit":        { "type": "string", "description": "UCUM code from the source Observation (D4)" },
      "effective":   { "type": "string", "format": "date-time", "description": "offset preserved (D7)" },
      "source":      { "type": "object", "required": ["connector", "version", "observation_id"] },
      "reliability": { "type": "string", "enum": ["good", "fair", "poor", "unknown"], "description": "fhir-core reliabilityFor(source, measure)" },
      "trend":       { "type": "object", "properties": { "window_days": { "type": "integer" }, "delta": { "type": "number" }, "n": { "type": "integer" } } },
      "display_hint":{ "type": "string", "enum": ["latest", "daily", "series"] }
    }
  }
},
"unmapped_measurements": { "type": "array", "items": { "type": "object", "required": ["measure", "reason"] } }
```

Mapping table `packages/twin-adapter/mapping/measure-to-system.v1.json`: one row per
`(system, code)` with `SystemId`, `display_hint`, `reviewer` and `review_record`. No row is
active without a named reviewer, as for terminology. Anything without a reviewed row goes to
`unmapped_measurements` with a reason; it is never dropped and never rerouted.

`packages/twin-adapter`: `toTwinTarget(bundles, { subjectRef, asOf, latestPer })` produces a
v0.3 document. `states[]` come from `@open-twin/interpreter` when lab data is present.
`TwinTargetWriter` implements `IHealthDataWriter` for `twin-target`. open-twin-xr consumes
`measurements[]` in its own repository.

### 5.H Documentation

- `docs/ARCHITECTURE.md`: purpose and scope; the four layers (D14); the reader interface
  (section 4 as normative text); the FHIR R4 target model; the registry; the data flow
  (readers, bundles, aggregate, twin-llm, twin-adapter, open-twin-xr); verification and
  release; cross-references to `DECISIONS.md`. It cites Bio-Formats as the model.
- `DECISIONS.md` D16 and D17; `docs/registry.md`; `docs/00-MAP.md` entries; README table
  generated; `BUILD-SUMMARY.md` pointing to `docs/ARCHITECTURE.md`.

---

## 6. Verification (definition of done)

- `pnpm ci:local` green, including the HL7 validator, with every registry
  `verificationBundles` entry emitted.
- New blocking gates: `verify/check-registry.ts`, the conformance suite in every adapter
  package, and `twin demo --fixtures` run in CI with its bundles uploaded as artefacts.
- `check-headers.ts` and `check-docs.ts` pass; new modules name their `GOVERNED BY`
  (`DECISIONS.md#d16`, `#d17`, `docs/specs/reader-architecture.md`).
- Reproducibility: the demo on fixtures gives byte-identical output on two machines with the
  same `now`.
- No growth in `docs/findings/no-external-authority.md` without a finding entry.

---

## 7. End-to-end demonstration

From a clean checkout, with no credentials beyond what the run needs:

1. `pnpm install --frozen-lockfile && pnpm build && pnpm verify`.
2. `twin list` shows the registry; `twin info` on one fixture per must-have connector names
   the reader.
3. `twin convert` for each must-have connector (Oura sandbox fixtures, Google Health
   recorded responses, VITRONIC recorded BodyLoop responses), then `twin validate` with zero
   errors.
4. `twin convert --reconcile` over the Oura and WHOOP fixtures gives one bundle in which
   every source observation is present, a shared measure is reconciled, and an abstention
   is recorded where no validation evidence supports a choice. This is the twin-llm hand-off.
5. Phase 2: `twin convert --to twin` gives one v0.3 Twin Target document that validates and
   opens in open-twin-xr with one traceable value per connector (source and version visible).

---

## 8. Guardrails and non-goals

- No storage, scheduling, user authentication, access control or UI in this repository; the
  CLI's file stores are reference implementations.
- No change to clinical semantics: measurements are displayed, never interpreted into
  severity (D13); `states[]` logic is untouched. Research and non-medical wellness use only
  ([intended use](../INTENDED-USE.md)).
- No new terminology codes without review records; no unit outside `UCUM.*`.
- No breaking change to public functions in phase 1; deprecations are announced in package
  READMEs and removed only in phase 3 with a decision entry.
- No live network in tests by default.
- Fixtures are synthetic or vendor-sandbox data with `PROVENANCE.md`.
- MIT licence; no copyleft dependencies; new packages carry the header convention and a
  README that declares their layer (D14).

---

## 9. Work breakdown (one issue and PR each, in order)

| #   | Scope                                                                                                                                                                 | Size   | Depends on        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- |
| 1   | This spec with corrections                                                                                                                                            | S      | none              |
| 2   | 5.A `reader-core`: types, interface, base class, conformance harness, fake-reader tests, D16                                                                          | L      | 1                 |
| 3   | 5.B registry: schema, `connectors.json`, loader, `check-registry`, generated docs                                                                                     | M      | 2                 |
| 4   | fhir-r4 adapter (simplest file reader)                                                                                                                                | S      | 2, 3              |
| 5   | Oura adapter with `TokenStore` bridge                                                                                                                                 | M      | 2, 3              |
| 6   | 5.E `ReconcilingReader` over aggregate: the twin-llm hand-off                                                                                                         | M      | 5                 |
| 7   | Google Health adapter (cursor, window in `bundleKey`)                                                                                                                 | M      | 5                 |
| 8   | VITRONIC adapter and runner                                                                                                                                           | M      | 5                 |
| 9   | WHOOP adapter (window in `bundleKey`)                                                                                                                                 | S      | 5                 |
| 10  | hl7v2, genomics-vcf, open-wearables, provider-anchor adapters                                                                                                         | S each | 4                 |
| 11  | 5.D delegator and CLI, `twin demo --fixtures`, `--reconcile`                                                                                                          | M      | 4 to 10           |
| 12  | twin-llm: consume `OpenTwinReader` and `ReconcilingReader` (issue in twin-llm)                                                                                        | M      | 6, 11             |
| 13  | 5.G contract v0.3 and D17                                                                                                                                             | M      | 2                 |
| 14  | 5.G `twin-adapter`, mapping with review records, `TwinTargetWriter`, `--to twin`                                                                                      | L      | 11, 13            |
| 15  | 5.H `docs/ARCHITECTURE.md`                                                                                                                                            | M      | can start after 3 |
| 16  | open-twin-xr consumes `measurements[]` (that repository)                                                                                                              | M      | 13                |
| 17  | Phase 3: writers, `ReferenceRangeReader`, retire the two `TokenHandler`s, generate the verification manifest from the registry, optional fetch injection in providers | M each | 11                |

Phase 1 is 1 to 12. Phase 2 is 13 to 16. Phase 3 is 17.

---

## 10. Decisions to confirm before coding

|     | Decision                                                    | Proposed                                                                                       |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| a   | Package names                                               | `@open-twin/reader-core` and `@open-twin/cli`                                                  |
| b   | Registry location                                           | repository root `registry/`, so non-TypeScript tools can read it                               |
| c   | Twin Target                                                 | extend `interpretation-contract` to v0.3 (one document for open-twin-xr)                       |
| d   | Reviewer of `measure-to-system` rows                        | a named clinical reviewer, as for terminology (blocks phase 2 only)                            |
| e   | open-wearables                                              | file reader only                                                                               |
| f   | Google Health and Fitbit                                    | id `google-health`, alias `fitbit`, with a written equivalence statement in `docs/registry.md` |
| g   | Verification manifest from the registry                     | phase 3 (safer)                                                                                |
| h   | Who builds adapters 7 to 10 and owns `docs/ARCHITECTURE.md` | to be agreed; items 2 to 6 serve as the reference implementation either way                    |
| i   | Bio-Formats attribution                                     | cited in `docs/ARCHITECTURE.md`                                                                |
| j   | Hand-off to twin-llm                                        | phase 1, through `ReconcilingReader`; twin-llm stops calling connectors directly               |

---

## 11. Corrections against `main`

Where draft 0.1 differed from the code at `34f12d6`, and how this draft resolves it.

| Draft 0.1 said                                                                       | The code has                                                                                                                                                                                                                                                                 | Resolution                                                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConnectorError` codes `config` and `unsupported-input`, constructed from one object | Codes are `auth`, `rate_limit`, `not_found`, `validation`, `transport`, `unsupported`, `server`, `unknown`; the constructor is `(message, { code, connector, ... })` (`fhir-core/src/errors.ts`)                                                                             | Use `validation` (operation `open`) and `unsupported`; fhir-core is unchanged                                                                                                |
| `OuraRingAppConfig.parse(...)`                                                       | Vendor configs (`OuraRingAppConfig`, `WhoopAppConfig`, `GoogleHealthAppConfig`, `BodyLoopClientConfig`) are TypeScript types, not zod schemas                                                                                                                                | Each adapter defines its zod config schema in `reader.ts`                                                                                                                    |
| Readers must not call the global `fetch`                                             | No provider accepts an injected fetch; Google Health goes through `googleapis`                                                                                                                                                                                               | Phase 1 tests stub `globalThis.fetch`; injection in the providers is a phase 3 item                                                                                          |
| `getOuraData(window, types, ...)`, then `getFhirBundleFromOuraData(data, ...)`       | Both take `(request: RequestParams, tokenHandler, options)`; `getFhirBundleFromOuraData` fetches and maps in one call; `sandbox` is an option, not a config field                                                                                                            | Adapter table and appendix use the real signatures                                                                                                                           |
| `fhir-core referenceRange`                                                           | The function is `referenceInterval`                                                                                                                                                                                                                                          | Renamed in 5.E                                                                                                                                                               |
| `provider-open-wearables` with `parse` and `seriesMap` builders                      | Package name `@open-twin/open-wearables`; `parseOrThrow`, `buildOpenWearablesBundle`, `SERIES_MAP`                                                                                                                                                                           | Renamed in 5.B and 5.C                                                                                                                                                       |
| `TokenStore` and `CursorStore` exist (D8)                                            | They exist only as prose in `DECISIONS.md`                                                                                                                                                                                                                                   | `reader-core` defines them for the first time                                                                                                                                |
| Every fixture has a `PROVENANCE.md`                                                  | Only provider-oura and genomics-vcf have one                                                                                                                                                                                                                                 | Each adapter PR adds the missing file (see #190)                                                                                                                             |
| Bundles are deterministic per request                                                | WHOOP (`bundleKey` `whoop\|<subjectKey>\|recovery,cycle,sleep`) and Google Health (`google-health\|<subjectKey>`) leave the window out, so different windows share one `Bundle.id`; Oura, WHOOP, Google Health and VCF fall back to `new Date()` when no timestamp is passed | Conformance rule 6 also checks distinct windows; the WHOOP and Google Health adapter PRs fix the key and change the tests that asserted it; adapters always pass `timestamp` |
| VITRONIC builder takes `subjectKey` and `timestamp`                                  | `BundleOptions` is `{ subject? }`; the key is `proband/<id>` and the timestamp comes from viatar meta                                                                                                                                                                        | The adapter passes `subject`; fixtures carry meta, so output stays reproducible                                                                                              |
| The flow ends at a twin adapter for open-twin-xr; aggregate is a phase 2 wrapper     | twin-llm calls connectors directly and does not use `@open-twin/aggregate`                                                                                                                                                                                                   | `ReconcilingReader` moves to phase 1 as the hand-off to twin-llm; the twin adapter stays phase 2                                                                             |
| CLI documented in `ONBOARDING.md`                                                    | `ONBOARDING.md` is maintained separately                                                                                                                                                                                                                                     | Documented in `packages/cli/README.md` and `docs/registry.md`                                                                                                                |

---

## Appendix: minimal adapter (Oura, phase 1)

The shape of an adapter, not final code.

```ts
/**
 * WHAT: IHealthDataReader adapter over getFhirBundleFromOuraData and TokenHandler.
 * NOT:  Does not re-implement mapping or token exchange. Does not persist tokens itself (host TokenStore, D8).
 * GOVERNED BY: DECISIONS.md#d16; docs/specs/reader-architecture.md
 * CORRECTNESS: recorded Oura sandbox responses (src/tests/fixtures, PROVENANCE.md) through the HL7 validator via verify/bundles.manifest.ts
 * GOTCHA: types are Oura data-type names, not FHIR codes; an unknown type is an issue, not an exception.
 */
import { ConnectorError } from '@open-twin/fhir-core';
import {
  HealthDataReader,
  type ReaderDescriptor,
  type ReaderInput,
  type ReaderMetadata,
  type ReadRequest,
  type ReadResult
} from '@open-twin/reader-core';
import { z } from 'zod';
import { getFhirBundleFromOuraData, TokenHandler } from './index';

const OuraReaderConfig = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.url(),
  sandbox: z.boolean().default(false)
});

export class OuraReader extends HealthDataReader {
  readonly descriptor: ReaderDescriptor = {
    id: 'oura',
    name: 'Oura Ring API v2',
    version: '0.1.0',
    kind: 'api',
    auth: 'oauth2',
    domains: ['wearable'],
    dataTypes: [
      /* as in the registry */
    ]
  };
  private config!: z.infer<typeof OuraReaderConfig>;
  private tokens!: TokenHandler;
  private tokenKey!: string;

  protected async onOpen(input: ReaderInput): Promise<void> {
    if (input.kind !== 'api')
      throw new ConnectorError('OuraReader needs an api input', {
        code: 'validation',
        connector: 'oura',
        operation: 'open'
      });
    const parsed = OuraReaderConfig.safeParse(input.config);
    if (!parsed.success)
      throw new ConnectorError('invalid Oura reader config', {
        code: 'validation',
        connector: 'oura',
        operation: 'open'
      });
    this.config = parsed.data;
    if (!input.tokenKey)
      throw new ConnectorError('OuraReader needs a per-wearer tokenKey', {
        code: 'validation',
        connector: 'oura',
        operation: 'open'
      });
    this.tokenKey = input.tokenKey;
    this.tokens = new TokenHandler(this.config, input.authorizationCode ?? '');
    const stored = await this.loadTokens(this.tokenKey);
    if (stored)
      this.tokens.setTokens(
        {
          access_token: stored.accessToken,
          refresh_token: stored.refreshToken ?? '',
          expires_in: 0,
          token_type: 'Bearer'
        },
        Date.parse(stored.expiresAt)
      );
    else if (input.authorizationCode) await this.tokens.authenticate();
  }

  async describe(): Promise<ReaderMetadata> {
    return {
      source: { id: 'oura', apiVersion: 'v2', endpoint: 'api.ouraring.com' },
      dataTypes: this.descriptor.dataTypes,
      capabilities: { incremental: false, sandbox: this.config.sandbox, write: false }
    };
  }

  async read(req: ReadRequest): Promise<ReadResult> {
    const timestamp = this.host.now?.() ?? new Date().toISOString();
    const request = {
      types: req.types ?? this.descriptor.dataTypes,
      start_date: req.window?.start.slice(0, 10),
      end_date: req.window?.end.slice(0, 10),
      utc_offset: req.window ? offsetOf(req.window.start) : undefined
    };
    const { bundle, issues } = await getFhirBundleFromOuraData(request, this.tokens, {
      sandbox: this.config.sandbox,
      subject: req.subject,
      subjectKey: req.subjectKey,
      timestamp
    });
    return {
      bundle,
      issues: issues.map(toIssue),
      provenance: {
        reader: { id: 'oura', version: this.descriptor.version },
        retrievedAt: timestamp,
        source: (await this.describe()).source,
        recordCount: bundle.entry?.length ?? 0
      }
    };
  }

  protected async onClose(): Promise<void> {
    const t = this.tokens?.getTokens();
    if (t)
      await this.saveTokens(this.tokenKey, {
        accessToken: t.tokens.access_token,
        refreshToken: t.tokens.refresh_token,
        expiresAt: new Date(t.expiresAt).toISOString()
      });
  }
}
export const createReader = () => new OuraReader();
```

`toIssue` maps Oura's issue shape to `Issue`; `offsetOf` returns the window's UTC offset (`Z` as `+00:00`). The exact option and issue types come from
`packages/provider-oura/src/index.ts` when implementing.
