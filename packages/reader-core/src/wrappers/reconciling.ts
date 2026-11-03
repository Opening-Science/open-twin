/**
 * WHAT: ReconcilingReader, the hand-off to twin-llm: reads one request from several readers and returns one bundle reconciled by @open-twin/aggregate, with every reconciliation and abstention recorded.
 * NOT:  Does not open the inner readers (they need different inputs and token keys; open them first) and does not decide between sources itself; aggregate does, on published evidence, and abstains without it.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d1; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: with no caller subject the wrapper mints one subject for every inner reader and adds the matching Patient itself, because each connector would otherwise mint its own and aggregate refuses to reconcile across subjects.
 */
import { AGGREGATOR, aggregate, type Reconciliation, type SourceBundle } from '@open-twin/aggregate';
import { buildBundle, ConnectorError, minimalPatient, subjectReference } from '@open-twin/fhir-core';
import type { IHealthDataReader, ReaderWrapper } from '../reader';
import type {
  HostServices,
  Issue,
  ReaderDescriptor,
  ReaderInput,
  ReaderMetadata,
  ReadProvenance,
  ReadRequest,
  ReadResult
} from '../types';

export interface ReconcilingReadResult extends ReadResult {
  /** One entry per measure and day that more than one source reported: selected, or abstained with the reason. */
  reconciliations: Reconciliation[];
  /** The provenance of each inner read that succeeded. */
  sources: ReadProvenance[];
}

const SUBJECT_SYSTEM = 'http://opentwin.ch/fhir/sid/open-twin';

export class ReconcilingReader implements ReaderWrapper {
  readonly inner: IHealthDataReader[];
  readonly descriptor: ReaderDescriptor;
  private host: HostServices = {};

  constructor(inner: IHealthDataReader[]) {
    if (inner.length === 0) {
      throw new ConnectorError('ReconcilingReader needs at least one inner reader', {
        code: 'validation',
        connector: AGGREGATOR.connector,
        operation: 'construct'
      });
    }
    this.inner = inner;
    this.descriptor = {
      id: AGGREGATOR.connector,
      name: 'Reconciled across sources',
      version: AGGREGATOR.version,
      kind: 'api',
      domains: [...new Set(inner.flatMap((reader) => reader.descriptor.domains))],
      dataTypes: [...new Set(inner.flatMap((reader) => reader.descriptor.dataTypes))],
      auth: 'none'
    };
  }

  isThisType(input: ReaderInput): boolean {
    return input.kind === 'api' && input.sourceId === this.descriptor.id;
  }

  /** Records the host. The inner readers are opened by the caller, each with its own input. */
  open(_input: ReaderInput, host: HostServices = {}): Promise<void> {
    this.host = host;
    return Promise.resolve();
  }

  async describe(): Promise<ReaderMetadata> {
    const all = await Promise.all(this.inner.map((reader) => reader.describe()));
    return {
      source: { id: this.descriptor.id },
      subjects: all.flatMap((meta) => meta.subjects ?? []),
      dataTypes: [...new Set(all.flatMap((meta) => meta.dataTypes))],
      capabilities: {
        incremental: all.every((meta) => meta.capabilities.incremental),
        sandbox: all.some((meta) => meta.capabilities.sandbox),
        write: false
      }
    };
  }

  async read(request: ReadRequest): Promise<ReconcilingReadResult> {
    const timestamp = this.host.now?.() ?? new Date().toISOString();
    const issues: Issue[] = [];
    const sources: SourceBundle[] = [];
    const provenances: ReadProvenance[] = [];

    // One subject for everyone, or aggregate cannot tell the sources are about one person.
    const subject =
      request.subject ?? subjectReference({ connector: this.descriptor.id, subjectKey: request.subjectKey });
    const innerRequest: ReadRequest = { ...request, subject };

    for (const reader of this.inner) {
      const id = reader.descriptor.id;
      try {
        const result = await reader.read(innerRequest);
        sources.push({ connector: id, bundle: result.bundle });
        provenances.push(result.provenance);
        issues.push(...result.issues.map((issue) => ({ ...issue, path: issue.path ? `${id}/${issue.path}` : id })));
      } catch (error) {
        // D6: one failing source must not discard the others.
        const code = error instanceof ConnectorError ? error.code : 'unknown';
        issues.push({ severity: 'error', code, details: `The ${id} reader failed and contributed nothing.`, path: id });
      }
    }
    if (sources.length === 0) {
      throw new ConnectorError('Every inner reader failed', {
        code: 'unknown',
        connector: this.descriptor.id,
        operation: 'read'
      });
    }

    if (!request.subject) {
      const patient = minimalPatient({
        connector: this.descriptor.id,
        subjectKey: request.subjectKey,
        identifierSystem: SUBJECT_SYSTEM
      });
      sources.push({
        connector: this.descriptor.id,
        bundle: buildBundle({
          connector: AGGREGATOR,
          resources: [patient],
          timestamp,
          bundleKey: `${this.descriptor.id}|patient|${request.subjectKey}`
        })
      });
    }

    const result = aggregate({ sources, subjectKey: request.subjectKey, timestamp });
    for (const r of result.reconciliations) {
      issues.push({
        severity: 'information',
        code: r.selected ? 'reconciled' : 'abstained',
        details: `${r.measure} on ${r.day} from ${r.sources.join(', ')}: ${r.policy}`,
        path: `reconciliation/${r.measure}/${r.day}`
      });
    }

    return {
      bundle: result.bundle,
      issues,
      reconciliations: result.reconciliations,
      sources: provenances,
      provenance: {
        reader: { id: this.descriptor.id, version: this.descriptor.version },
        retrievedAt: timestamp,
        source: { id: this.descriptor.id },
        recordCount: result.bundle.entry?.length ?? 0
      }
    };
  }

  async close(): Promise<void> {
    for (const reader of this.inner) await reader.close();
  }
}
