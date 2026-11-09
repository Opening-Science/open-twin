/**
 * WHAT: ReconcilingReader, the hand-off to twin-llm: reads one request from several readers and returns one bundle reconciled by @open-twin/aggregate, with every reconciliation and abstention recorded.
 * NOT:  Does not open the inner readers (they need different inputs and token keys; open them first) and does not decide between sources itself; aggregate does, on published evidence, and abstains without it.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d1; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: with no caller subject the wrapper mints one subject for every inner reader and carries the Patient itself, because each connector would otherwise mint its own and aggregate refuses to reconcile across subjects.
 */
import { AGGREGATOR, aggregate, type Reconciliation, type SourceBundle } from '@open-twin/aggregate';
import { buildBundle, ConnectorError } from '@open-twin/fhir-core';
import { HealthDataReader } from '../base';
import type { IHealthDataReader, ReaderWrapper } from '../reader';
import type {
  Issue,
  ReaderDescriptor,
  ReaderInput,
  ReaderMetadata,
  ReadProvenance,
  ReadRequest,
  ReadResult
} from '../types';

export interface ReconcilingReadResult extends ReadResult {
  /** One per measure and day that more than one source reported: selected, or abstained with the reason. */
  reconciliations: Reconciliation[];
  /** The provenance of each inner read that succeeded. */
  sources: ReadProvenance[];
}

export class ReconcilingReader extends HealthDataReader implements ReaderWrapper {
  readonly inner: IHealthDataReader[];
  readonly descriptor: ReaderDescriptor;

  constructor(inner: IHealthDataReader[]) {
    super();
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
    const timestamp = this.now();
    const subject = this.subjectFor(request);
    const issues: Issue[] = [];
    const sources: SourceBundle[] = [];
    const provenances: ReadProvenance[] = [];

    for (const reader of this.inner) {
      const id = reader.descriptor.id;
      // Each reader gets only the types it knows; a reader with none to read is skipped.
      const types = request.types?.filter((type) => reader.descriptor.dataTypes.includes(type));
      if (types?.length === 0) continue;
      try {
        const result = await reader.read({ ...request, subject: subject.reference, types });
        sources.push({ connector: id, bundle: result.bundle });
        provenances.push(result.provenance);
        issues.push(...result.issues.map((issue) => ({ ...issue, path: issue.path ? `${id}/${issue.path}` : id })));
      } catch (error) {
        // D6: a source that fails is an issue, not a lost read. Anything else is a bug and surfaces.
        if (!(error instanceof ConnectorError)) throw error;
        issues.push({
          severity: 'error',
          code: error.code,
          details: `The ${id} reader failed and contributed nothing.`,
          path: id
        });
      }
    }
    if (sources.length === 0) throw this.fail('Every inner reader failed or had nothing to read', 'unknown', 'read');

    if (subject.patient) {
      sources.push({
        connector: this.descriptor.id,
        bundle: buildBundle({
          connector: this.connector,
          resources: [subject.patient],
          bundleKey: `${this.descriptor.id}|patient|${request.subjectKey}`,
          timestamp
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
      provenance: this.provenanceFor(result.bundle)
    };
  }

  /** The inner readers arrive open; the wrapper itself has nothing to open. */
  protected onOpen(_input: ReaderInput): Promise<void> {
    return Promise.resolve();
  }

  protected async onClose(): Promise<void> {
    for (const reader of this.inner) await reader.close();
  }
}
