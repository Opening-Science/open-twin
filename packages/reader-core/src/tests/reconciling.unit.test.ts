import {
  buildBundle,
  CATEGORY,
  ConnectorError,
  createObservation,
  deterministicId,
  quantity,
  SYSTEMS,
  UCUM
} from '@open-twin/fhir-core';
import type { Observation } from 'fhir/r4';
import { describe, expect, it, vi } from 'vitest';
import { HealthDataReader } from '../base';
import type { ReaderDescriptor, ReaderMetadata, ReadRequest, ReadResult } from '../types';
import { withConnectorTag } from '../utils/connectorTag';
import { ReconcilingReader } from '../wrappers/reconciling';

const RESTING_HEART_RATE = '40443-4';
const ENERGY = '41979-6';
const NOW = '2026-01-01T00:00:00Z';

interface Reading {
  code: string;
  day: string;
  value: number;
}

/** Stands in for a connector by id, so aggregate finds that connector's evidence. */
class StubReader extends HealthDataReader {
  readonly descriptor: ReaderDescriptor;
  constructor(
    id: string,
    private readonly readings: Reading[],
    private readonly failWith?: Error
  ) {
    super();
    this.descriptor = {
      id,
      name: id,
      version: '0.0.1',
      kind: 'api',
      domains: ['wearable'],
      dataTypes: ['x'],
      auth: 'none'
    };
  }
  protected onOpen(): Promise<void> {
    return Promise.resolve();
  }

  protected onClose(): Promise<void> {
    return Promise.resolve();
  }

  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: { id: this.descriptor.id },
      dataTypes: ['x'],
      capabilities: { incremental: false, sandbox: false, write: false }
    });
  }
  read(request: ReadRequest): Promise<ReadResult> {
    if (this.failWith) return Promise.reject(this.failWith);
    const subject = this.subjectFor(request);
    const observations: Observation[] = this.readings.map((reading) =>
      createObservation({
        id: deterministicId({
          connector: this.descriptor.id,
          subjectKey: request.subjectKey,
          recordId: reading.day,
          measure: reading.code
        }),
        code: { system: SYSTEMS.LOINC, code: reading.code },
        category: CATEGORY.VITAL_SIGNS,
        subject: subject.reference,
        effectiveDateTime: reading.day,
        valueQuantity: quantity(reading.value, reading.code === ENERGY ? UCUM.KILOCALORIE : UCUM.PER_MINUTE)
      })
    );
    const bundle = withConnectorTag(
      buildBundle({
        connector: this.connector,
        resources: [...(subject.patient ? [subject.patient] : []), ...observations],
        timestamp: this.now(),
        bundleKey: this.bundleKeyFor(request)
      }),
      this.connector
    );
    const issues = [
      this.issue('information', 'stub', 'from the stub'),
      this.issue('information', 'stub-at', 'with a path', 'days[0]')
    ];
    return Promise.resolve({ bundle, issues, provenance: this.provenanceFor(bundle) });
  }
}

const oura = () =>
  new StubReader('oura', [
    { code: RESTING_HEART_RATE, day: '2026-03-01', value: 52 },
    { code: ENERGY, day: '2026-03-01', value: 2100 }
  ]);
const whoop = () =>
  new StubReader('whoop', [
    { code: RESTING_HEART_RATE, day: '2026-03-01', value: 55 },
    { code: ENERGY, day: '2026-03-01', value: 1900 }
  ]);
const request: ReadRequest = {
  subjectKey: 'wearer-1',
  window: { start: '2026-03-01T00:00:00+01:00', end: '2026-03-02T00:00:00+01:00' }
};

async function readAll(readers: StubReader[], req: ReadRequest = request) {
  const reader = new ReconcilingReader(readers);
  for (const inner of readers)
    await inner.open({ kind: 'api', sourceId: inner.descriptor.id, config: {} }, { now: () => NOW });
  await reader.open({ kind: 'api', sourceId: 'open-twin', config: {} }, { now: () => NOW });
  return reader.read(req);
}

const observations = (result: ReadResult) =>
  (result.bundle.entry ?? []).map((e) => e.resource).filter((r): r is Observation => r?.resourceType === 'Observation');

describe('ReconcilingReader', () => {
  it('carries every source Observation and adds a derived one per selected reconciliation', async () => {
    const result = await readAll([oura(), whoop()]);
    const all = observations(result);
    expect(all.filter((o) => o.derivedFrom === undefined)).toHaveLength(4);
    const selected = result.reconciliations.filter((r) => r.selected);
    expect(all.filter((o) => o.derivedFrom !== undefined)).toHaveLength(selected.length);
    expect(result.reconciliations.map((r) => r.sources)).toEqual([
      ['oura', 'whoop'],
      ['oura', 'whoop']
    ]);
  });

  it('records each reconciliation as an information issue under its measure and day', async () => {
    const result = await readAll([oura(), whoop()]);
    const codes = result.issues.map((i) => `${i.code}@${i.path}`);
    for (const r of result.reconciliations) {
      expect(codes).toContain(`${r.selected ? 'reconciled' : 'abstained'}@reconciliation/${r.measure}/${r.day}`);
      expect(r.policy).toBeTruthy();
    }
  });

  it('gives every reader one subject and carries one Patient for it; a caller subject is used verbatim', async () => {
    const minted = await readAll([oura(), whoop()]);
    const subjects = new Set(observations(minted).map((o) => o.subject?.reference));
    expect(subjects.size).toBe(1);
    const patients = (minted.bundle.entry ?? []).filter((e) => e.resource?.resourceType === 'Patient');
    expect(patients).toHaveLength(1);
    expect(patients[0]?.fullUrl).toBe([...subjects][0]);

    const given = await readAll([oura(), whoop()], { ...request, subject: { reference: 'Patient/caller-7' } });
    expect(new Set(observations(given).map((o) => o.subject?.reference))).toEqual(new Set(['Patient/caller-7']));
    expect((given.bundle.entry ?? []).some((e) => e.resource?.resourceType === 'Patient')).toBe(false);
  });

  it('keeps the other sources when a reader fails with a ConnectorError, and lets a bug surface (D6)', async () => {
    const failing = () =>
      new StubReader('whoop', [], new ConnectorError('down', { code: 'server', connector: 'whoop' }));
    const result = await readAll([oura(), failing()]);
    expect(observations(result)).toHaveLength(2);
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'server', path: 'whoop' }));
    expect(result.sources.map((s) => s.reader.id)).toEqual(['oura']);
    await expect(readAll([failing()])).rejects.toMatchObject({ code: 'unknown', operation: 'read' });
    await expect(readAll([new StubReader('whoop', [], new TypeError('bug'))])).rejects.toThrow(TypeError);
  });

  it('gives each reader only the types it knows and skips a reader with none', async () => {
    const seen: string[][] = [];
    class Spy extends StubReader {
      override read(req: ReadRequest) {
        seen.push(req.types ?? []);
        return super.read(req);
      }
    }
    const a = new Spy('oura', [{ code: RESTING_HEART_RATE, day: '2026-03-01', value: 52 }]);
    a.descriptor.dataTypes = ['sleep'];
    const b = new Spy('whoop', [{ code: RESTING_HEART_RATE, day: '2026-03-01', value: 55 }]);
    b.descriptor.dataTypes = ['recovery'];
    const result = await readAll([a, b], { ...request, types: ['sleep'] });
    expect(seen).toEqual([['sleep']]);
    expect(result.sources.map((s) => s.reader.id)).toEqual(['oura']);
  });

  it('prefixes inner issues with the reader id and is reproducible on a fixed clock', async () => {
    const first = await readAll([oura(), whoop()]);
    const second = await readAll([oura(), whoop()]);
    expect(JSON.stringify(first.bundle)).toBe(JSON.stringify(second.bundle));
    expect(first.issues).toContainEqual(expect.objectContaining({ code: 'stub', path: 'oura' }));
    expect(first.issues).toContainEqual(expect.objectContaining({ code: 'stub-at', path: 'whoop/days[0]' }));
    expect(first.bundle.timestamp).toBe(NOW);
    expect(first.provenance.reader.id).toBe('open-twin');
  });

  it('describes the union of its readers and closes each of them', async () => {
    const a = oura();
    const b = whoop();
    const closeA = vi.spyOn(a, 'close');
    const reader = new ReconcilingReader([a, b]);
    expect(reader.descriptor).toMatchObject({ id: 'open-twin', kind: 'api', auth: 'none', domains: ['wearable'] });
    expect(reader.isThisType({ kind: 'api', sourceId: 'open-twin', config: {} })).toBe(true);
    expect((await reader.describe()).dataTypes).toEqual(['x']);
    await reader.close();
    expect(closeA).toHaveBeenCalledOnce();
    expect(() => new ReconcilingReader([])).toThrow(/at least one/);
  });
});
