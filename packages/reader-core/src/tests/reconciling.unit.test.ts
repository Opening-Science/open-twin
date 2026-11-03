import { CATEGORY, createObservation, deterministicId, quantity, SYSTEMS, UCUM } from '@open-twin/fhir-core';
import type { Observation } from 'fhir/r4';
import { describe, expect, it, vi } from 'vitest';
import { HealthDataReader } from '../base';
import type { ReaderDescriptor, ReaderMetadata, ReadRequest, ReadResult } from '../types';
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
    const bundle = this.withConnectorTag(
      this.bundleFrom({
        resources: [...(subject.patient ? [subject.patient] : []), ...observations],
        bundleKey: this.bundleKeyFor(request)
      })
    );
    return Promise.resolve({
      bundle,
      issues: [this.issue('information', 'stub', 'from the stub')],
      provenance: this.provenanceFor(bundle, { id: this.descriptor.id })
    });
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
  it('carries every source Observation and adds a derived one where evidence prefers a source', async () => {
    const result = await readAll([oura(), whoop()]);
    const all = observations(result);
    expect(all.filter((o) => o.derivedFrom === undefined)).toHaveLength(4);
    const derived = all.filter((o) => o.derivedFrom !== undefined);
    expect(derived).toHaveLength(1);
    expect(derived[0]?.derivedFrom).toHaveLength(2);
    expect(result.reconciliations).toEqual([
      expect.objectContaining({ measure: 'energy-expenditure', day: '2026-03-01', sources: ['oura', 'whoop'] }),
      expect.objectContaining({ measure: 'resting-heart-rate', day: '2026-03-01', selected: 'oura' })
    ]);
  });

  it('abstains for a measure without evidence and records why', async () => {
    const result = await readAll([oura(), whoop()]);
    const energy = result.reconciliations.find((r) => r.measure === 'energy-expenditure');
    expect(energy?.selected).toBeUndefined();
    expect(energy?.policy).toMatch(/No source is dependable/);
    const codes = result.issues.map((i) => `${i.code}@${i.path}`);
    expect(codes).toContain('abstained@reconciliation/energy-expenditure/2026-03-01');
    expect(codes).toContain('reconciled@reconciliation/resting-heart-rate/2026-03-01');
  });

  it('gives every reader one subject and carries one Patient for it', async () => {
    const result = await readAll([oura(), whoop()]);
    const subjects = new Set(observations(result).map((o) => o.subject?.reference));
    expect(subjects.size).toBe(1);
    const patients = (result.bundle.entry ?? []).filter((e) => e.resource?.resourceType === 'Patient');
    expect(patients).toHaveLength(1);
    expect(patients[0]?.fullUrl).toBe([...subjects][0]);
  });

  it('uses the caller subject verbatim and adds no Patient', async () => {
    const result = await readAll([oura(), whoop()], { ...request, subject: { reference: 'Patient/caller-7' } });
    expect(new Set(observations(result).map((o) => o.subject?.reference))).toEqual(new Set(['Patient/caller-7']));
    expect((result.bundle.entry ?? []).some((e) => e.resource?.resourceType === 'Patient')).toBe(false);
  });

  it('keeps the other sources when one reader fails, and names the failed one (D6)', async () => {
    const broken = new StubReader('whoop', [], new Error('boom'));
    const result = await readAll([oura(), broken]);
    expect(observations(result)).toHaveLength(2);
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', path: 'whoop' }));
    expect(result.sources.map((s) => s.reader.id)).toEqual(['oura']);
    await expect(readAll([broken])).rejects.toMatchObject({ code: 'unknown', operation: 'read' });
  });

  it('prefixes inner issues with the reader id and is reproducible on a fixed clock', async () => {
    const first = await readAll([oura(), whoop()]);
    const second = await readAll([oura(), whoop()]);
    expect(JSON.stringify(first.bundle)).toBe(JSON.stringify(second.bundle));
    expect(first.issues).toContainEqual(expect.objectContaining({ code: 'stub', path: 'oura' }));
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
