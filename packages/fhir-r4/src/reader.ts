/**
 * WHAT: FhirR4Reader, the IHealthDataReader adapter over normaliseBundle: sniffs a JSON Bundle, normalises it under the caller's subject key, and reports every validation finding as an issue.
 * NOT:  Does not change validation or normalisation. Does not apply a window or a types filter: a foreign bundle is read whole, and both are reported instead.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import {
  fileJson,
  fileText,
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
import { normaliseBundle, normalisedEntryId } from './normalise/normalise';

const CONNECTOR = { connector: 'fhir-r4', version: '0.1.0' } as const;
const SOURCE: ReaderMetadata['source'] = { id: CONNECTOR.connector, apiVersion: '4.0.1' };

export const FHIR_R4_DESCRIPTOR: ReaderDescriptor = {
  id: CONNECTOR.connector,
  name: 'Foreign FHIR R4 bundles',
  version: CONNECTOR.version,
  kind: 'file',
  domains: ['clinical-record', 'lab', 'synthetic'],
  dataTypes: ['bundle'],
  auth: 'none',
  suffixes: ['.json'],
  mediaTypes: ['application/fhir+json', 'application/json'],
  vendorDocs: 'https://hl7.org/fhir/R4/bundle.html'
};

interface JsonObject {
  [key: string]: unknown;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function toIssue(finding: FhirIssue): Issue {
  return {
    severity: finding.severity === 'fatal' ? 'error' : finding.severity,
    code: finding.rule,
    details: finding.message,
    path: finding.expression
  };
}

export class FhirR4Reader extends HealthDataReader {
  readonly descriptor: ReaderDescriptor = FHIR_R4_DESCRIPTOR;
  private bundle: JsonObject | undefined;

  override isThisType(input: ReaderInput): boolean {
    const text = fileText(input);
    return text !== undefined && /"resourceType"\s*:\s*"Bundle"/.test(text);
  }

  protected onOpen(input: ReaderInput): Promise<void> {
    const json = fileJson(input);
    if (!isObject(json) || json.resourceType !== 'Bundle') {
      throw this.fail('The input is not a FHIR Bundle in JSON', 'validation', 'open');
    }
    this.bundle = json;
    return Promise.resolve();
  }

  protected onClose(): Promise<void> {
    return Promise.resolve();
  }

  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: SOURCE,
      dataTypes: this.descriptor.dataTypes,
      capabilities: { incremental: false, sandbox: false, write: false }
    });
  }

  /**
   * With no caller subject and exactly one Patient in the bundle, that Patient is the
   * subject under its normalised id, so its demographics survive. Otherwise the D1
   * fallback mints an empty one.
   */
  private subjectFromBundle(bundle: JsonObject, subjectKey: string): Reference | undefined {
    const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
    const patients = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => isObject(entry) && isObject(entry.resource) && entry.resource.resourceType === 'Patient');
    const only = patients.length === 1 ? patients[0] : undefined;
    if (!only || !isObject(only.entry)) return undefined;
    const entry = only.entry as { fullUrl?: string; resource?: JsonObject };
    return { reference: `urn:uuid:${normalisedEntryId(this.descriptor.id, subjectKey, 'Patient', entry, only.index)}` };
  }

  read(request: ReadRequest): Promise<ReadResult> {
    return Promise.resolve().then(() => this.readOpened(request));
  }

  private readOpened(request: ReadRequest): ReadResult {
    const { bundle } = this;

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
    if (request.types?.some((type) => !this.descriptor.dataTypes.includes(type))) {
      issues.push(
        this.issue('warning', 'unknown-type', 'A requested type is not one this reader supports and was ignored.')
      );
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

    const result = normaliseBundle(bundle, {
      connector: { ...CONNECTOR },
      subjectKey: request.subjectKey,
      subject: request.subject ?? fromBundle,
      unresolvedUrnPolicy: 'preserve',
      timestamp: this.now(),
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
    return { bundle: result.bundle, issues, provenance: this.provenanceFor(result.bundle, SOURCE) };
  }
}

export const createReader = (): FhirR4Reader => new FhirR4Reader();
