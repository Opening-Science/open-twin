/**
 * WHAT: FhirR4Reader, the IHealthDataReader adapter over validateFhir and normaliseBundle: sniffs a JSON Bundle, normalises it under the caller's subject key, and reports every validation finding as an issue.
 * NOT:  Does not change validation or normalisation; both are called as they are. Does not apply a request window or a types filter, because a foreign bundle is read whole; both are reported as issues instead of silently dropped.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: when the caller supplies no subject and the bundle carries exactly one Patient, that Patient becomes the subject under its normalised id, so its demographics survive. With no Patient, or several, the D1 fallback mints an empty one; a foreign Patient is then reported as orphaned.
 */
import { readFileSync } from 'node:fs';
import { deterministicId } from '@open-twin/fhir-core';
import {
  HealthDataReader,
  type Issue,
  type ReaderDescriptor,
  type ReaderInput,
  type ReaderMetadata,
  type ReadRequest,
  type ReadResult
} from '@open-twin/reader-core';
import type { Reference } from 'fhir/r4';
import type { FhirIssue } from './issues';
import { normaliseBundle } from './normalise/normalise';

export const FHIR_R4_CONNECTOR = { connector: 'fhir-r4', version: '0.1.0' } as const;

/** Must equal the entry in registry/connectors.json; verify/check-registry.ts compares them. */
export const FHIR_R4_DESCRIPTOR: ReaderDescriptor = {
  id: FHIR_R4_CONNECTOR.connector,
  name: 'Foreign FHIR R4 bundles',
  version: FHIR_R4_CONNECTOR.version,
  kind: 'file',
  domains: ['clinical-record', 'lab', 'synthetic'],
  dataTypes: ['bundle'],
  auth: 'none',
  suffixes: ['.json'],
  mediaTypes: ['application/fhir+json', 'application/json'],
  vendorDocs: 'https://hl7.org/fhir/R4/bundle.html'
};

const BUNDLE_SNIFF = /"resourceType"\s*:\s*"Bundle"/;

interface JsonObject {
  [key: string]: unknown;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function textOf(input: ReaderInput): string | undefined {
  if (input.kind !== 'file') return undefined;
  if (input.text !== undefined) return input.text;
  if (input.bytes) return new TextDecoder().decode(input.bytes);
  if (input.path) {
    try {
      return readFileSync(input.path, 'utf8');
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function toIssue(finding: FhirIssue): Issue {
  return {
    severity: finding.severity === 'fatal' ? 'error' : finding.severity,
    code: finding.rule,
    details: finding.message,
    path: finding.expression
  };
}

/**
 * The id normaliseBundle will give the entry: its fullUrl, else its RESTful address,
 * else its position. Replicated here so the subject can point at the bundle's own
 * Patient before normalisation runs.
 */
function normalisedId(connector: string, subjectKey: string, entry: JsonObject, index: number): string {
  const resource = isObject(entry.resource) ? entry.resource : {};
  const address = typeof resource.id === 'string' ? `Patient/${resource.id}` : undefined;
  const sourceKey = typeof entry.fullUrl === 'string' ? entry.fullUrl : (address ?? `entry-${index}`);
  return deterministicId({ connector, subjectKey, recordId: sourceKey, measure: 'Patient' });
}

export class FhirR4Reader extends HealthDataReader {
  readonly descriptor: ReaderDescriptor = FHIR_R4_DESCRIPTOR;
  private bundle: JsonObject | undefined;

  override isThisType(input: ReaderInput): boolean {
    const text = textOf(input);
    return text !== undefined && BUNDLE_SNIFF.test(text);
  }

  protected override onOpen(input: ReaderInput): Promise<void> {
    const text = textOf(input);
    let json: unknown;
    try {
      json = text === undefined ? undefined : JSON.parse(text);
    } catch {
      json = undefined;
    }
    if (!isObject(json) || json.resourceType !== 'Bundle') {
      throw this.fail('The input is not a FHIR Bundle in JSON', 'validation', 'open');
    }
    this.bundle = json;
    return Promise.resolve();
  }

  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: { id: this.descriptor.id, apiVersion: '4.0.1' },
      dataTypes: this.descriptor.dataTypes,
      capabilities: { incremental: false, sandbox: false, write: false }
    });
  }

  /** The bundle's own Patient as the subject, when there is exactly one and the caller named none. */
  private subjectFromBundle(bundle: JsonObject, subjectKey: string): Reference | undefined {
    const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
    const patients = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => isObject(entry) && isObject(entry.resource) && entry.resource.resourceType === 'Patient');
    const only = patients.length === 1 ? patients[0] : undefined;
    if (!only || !isObject(only.entry)) return undefined;
    return { reference: `urn:uuid:${normalisedId(this.descriptor.id, subjectKey, only.entry, only.index)}` };
  }

  read(request: ReadRequest): Promise<ReadResult> {
    return Promise.resolve().then(() => this.readOpened(request));
  }

  private readOpened(request: ReadRequest): ReadResult {
    this.requireOpen();
    const bundle = this.bundle;
    if (!bundle) throw this.fail('read called before open', 'validation', 'read');
    const issues: Issue[] = [];

    if (request.window) {
      issues.push(
        this.issue(
          'information',
          'window-not-applied',
          'A FHIR bundle is read whole; the request window was not applied.'
        )
      );
    }
    for (const type of request.types ?? []) {
      if (!this.descriptor.dataTypes.includes(type)) {
        issues.push(
          this.issue('warning', 'unknown-type', 'A requested type is not one this reader supports and was ignored.')
        );
      }
    }

    const fromBundle = request.subject ? undefined : this.subjectFromBundle(bundle, request.subjectKey);
    if (fromBundle) {
      issues.push(
        this.issue(
          'information',
          'subject-from-bundle',
          "The bundle's only Patient became the subject under its normalised id."
        )
      );
    }

    const timestamp = this.now();
    const result = normaliseBundle(bundle, {
      connector: { ...FHIR_R4_CONNECTOR },
      subjectKey: request.subjectKey,
      subject: request.subject ?? fromBundle,
      unresolvedUrnPolicy: 'preserve',
      timestamp,
      bundleKey: this.bundleKeyFor(request)
    });
    issues.push(...result.issues.map(toIssue));
    if (!result.bundle) {
      const blocking = result.issues.filter((i) => i.severity === 'error' || i.severity === 'fatal').length;
      throw this.fail(
        `The bundle failed validation (${blocking} blocking finding(s)) and was not normalised`,
        'validation',
        'read'
      );
    }
    return {
      bundle: result.bundle,
      issues,
      provenance: this.provenanceFor(result.bundle, { id: this.descriptor.id, apiVersion: '4.0.1' })
    };
  }
}

export const createReader = (): FhirR4Reader => new FhirR4Reader();
