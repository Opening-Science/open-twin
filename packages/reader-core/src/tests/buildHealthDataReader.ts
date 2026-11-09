import { buildBundle } from '@open-twin/fhir-core';
import { HealthDataReader } from '../base';
import type { HostServices, ReaderDescriptor, ReaderInput, ReaderMetadata, ReadRequest, ReadResult } from '../types';
import { withConnectorTag } from '../utils/connectorTag';
import type { Parser } from '../utils/parser';

export const PROBE_DESCRIPTOR: ReaderDescriptor = {
  id: 'probe',
  name: 'Probe',
  version: '0.1.0',
  kind: 'api',
  domains: ['wearable'],
  dataTypes: ['a', 'b'],
  auth: 'bearer'
};

export const PROBE_URL = 'https://example.invalid/v1?token=abc';
export const PROBE_STORE_KEY = 'probe';

const ProbeConfig: Parser<{ url: string }> = {
  safeParse: (data) =>
    typeof data === 'object' && data !== null && typeof (data as { url?: unknown }).url === 'string'
      ? { success: true, data: { url: (data as { url: string }).url } }
      : { success: false, error: { issues: [{ path: ['url'] }] } }
};

const Payload: Parser<{ ok: boolean }> = {
  safeParse: (data) =>
    typeof data === 'object' && data !== null && typeof (data as { ok?: unknown }).ok === 'boolean'
      ? { success: true, data: data as { ok: boolean } }
      : { success: false, error: { issues: [{ path: ['ok'] }] } }
};

/** The smallest real reader: one fetch, one bundle, tokens and a cursor through the host stores. */
class ProbeReader extends HealthDataReader {
  readonly descriptor = PROBE_DESCRIPTOR;
  private config: { url: string } | undefined;
  private cursor: string | undefined;

  protected async onOpen(input: ReaderInput): Promise<void> {
    if (input.kind !== 'api') throw this.fail('An api input is required', 'validation', 'open');

    this.config = this.parseConfig(ProbeConfig, input.config);
    this.cursor = await this.loadCursor(PROBE_STORE_KEY);
  }

  protected async onClose(): Promise<void> {
    if (this.cursor !== undefined) await this.saveCursor(PROBE_STORE_KEY, this.cursor);

    const tokens = await this.loadTokens(PROBE_STORE_KEY);

    if (tokens) await this.saveTokens(PROBE_STORE_KEY, tokens);
  }

  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: { id: this.descriptor.id },
      dataTypes: this.descriptor.dataTypes,
      capabilities: { incremental: true, sandbox: false, write: false }
    });
  }

  async read(request: ReadRequest): Promise<ReadResult> {
    if (!this.input || !this.config) throw this.fail('read called before open', 'validation', 'read');

    const payload = await this.fetchJson(this.config.url, Payload, 'GET probe');
    const subject = this.subjectFor(request);
    const bundle = withConnectorTag(
      buildBundle({
        connector: this.connector,
        resources: subject.patient ? [subject.patient] : [],
        timestamp: this.now(),
        bundleKey: this.bundleKeyFor(request)
      }),
      this.connector
    );
    const issues = payload.ok ? [] : [this.issue('warning', 'not-ok', 'The probe payload was not ok.')];
    this.cursor = request.window?.end ?? this.cursor;
    return { bundle, issues, cursor: this.cursor, provenance: this.provenanceFor(bundle) };
  }
}

export function buildHealthDataReader(): HealthDataReader {
  return new ProbeReader();
}

export async function openHealthDataReader(host: HostServices = {}): Promise<HealthDataReader> {
  const reader = buildHealthDataReader();
  await reader.open({ kind: 'api', sourceId: 'probe', config: { url: PROBE_URL } }, host);
  return reader;
}
