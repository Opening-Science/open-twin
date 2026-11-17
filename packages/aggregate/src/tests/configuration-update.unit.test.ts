import {
  declareMeasurement,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementDeclaration,
  type MeasurementDeclarationSet,
  SYSTEMS
} from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import {
  createMeasurementCatalogue,
  generateReconciliationConfiguration,
  type MeasurementCatalogue,
  type ReconciliationConfiguration,
  updateReconciliationConfiguration,
  validateReconciliationConfiguration
} from '../index';

const sleep = declareMeasurement('total-sleep-time', { system: SYSTEMS.LOINC, code: '93832-4' });
const heartRate = declareMeasurement('resting-heart-rate', { system: SYSTEMS.LOINC, code: '40443-4' });
const timeInBed = declareMeasurement('time-in-bed', { system: SYSTEMS.LOINC, code: '103213-5' });

function registration(connector: string, declarations: MeasurementDeclaration[]): MeasurementDeclarationSet {
  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    connector,
    version: 1,
    coverage: 'complete',
    definitions: [],
    declarations
  };
}

const a = registration('source-a', [sleep, heartRate]);
const b = registration('source-b', [sleep, heartRate]);
const c = registration('source-c', [sleep, heartRate]);
const previous = createMeasurementCatalogue([a, b, c]);

function edited(): ReconciliationConfiguration {
  return {
    version: 1,
    measurements: {
      'total-sleep-time': { sourcePriority: ['source-b', 'source-a'], missingData: 'fallback' },
      'resting-heart-rate': { sourcePriority: ['source-c'], missingData: 'strict' }
    }
  };
}

function sleepEntry(catalogue: MeasurementCatalogue) {
  const entry = catalogue.entries.find((candidate) => candidate.key === sleep.key);
  if (!entry) throw new Error('Expected sleep catalogue entry');
  return entry;
}

function freeze(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}

describe('updateReconciliationConfiguration', () => {
  it('preserves edited order, exclusions and per-key modes when registrations are reordered', () => {
    const result = updateReconciliationConfiguration(edited(), previous, createMeasurementCatalogue([c, b, a]));
    expect(result).toEqual({
      ok: true,
      proposedConfiguration: edited(),
      changes: [],
      conflicts: [],
      problems: []
    });
  });

  it('appends only genuinely new supporting sources in next registration order', () => {
    const next = createMeasurementCatalogue([
      registration('source-e', [sleep]),
      c,
      registration('source-d', [sleep, heartRate]),
      b,
      a
    ]);
    const result = updateReconciliationConfiguration(edited(), previous, next);
    expect(result.ok).toBe(true);
    expect(result.proposedConfiguration?.measurements).toEqual({
      'total-sleep-time': {
        sourcePriority: ['source-b', 'source-a', 'source-e', 'source-d'],
        missingData: 'fallback'
      },
      'resting-heart-rate': { sourcePriority: ['source-c', 'source-d'], missingData: 'strict' }
    });
    expect(result.changes).toEqual([
      { code: 'source-added', key: heartRate.key, connector: 'source-d', requiresResolution: false },
      { code: 'source-added', key: sleep.key, connector: 'source-e', requiresResolution: false },
      { code: 'source-added', key: sleep.key, connector: 'source-d', requiresResolution: false }
    ]);
  });

  it('recognizes newly supported keys on an already registered connector as new sources', () => {
    const baseline = createMeasurementCatalogue([a, registration('source-b', [heartRate])]);
    const input = generateReconciliationConfiguration(baseline);
    const result = updateReconciliationConfiguration(input, baseline, createMeasurementCatalogue([b, a]));
    expect(result.ok).toBe(true);
    expect(result.proposedConfiguration?.measurements[sleep.key]).toEqual({
      sourcePriority: ['source-b', 'source-a'],
      missingData: 'strict'
    });
    expect(result.changes).toContainEqual({ code: 'became-shared', key: sleep.key, requiresResolution: false });
  });

  it('creates defaults for newly shared measurements, but not newly discovered unique ones', () => {
    const baseline = createMeasurementCatalogue([]);
    const next = createMeasurementCatalogue([registration('source-b', [sleep, timeInBed]), a]);
    const result = updateReconciliationConfiguration({ version: 1, measurements: {} }, baseline, next);
    expect(result.ok).toBe(true);
    expect(result.proposedConfiguration).toEqual({
      version: 1,
      measurements: { [sleep.key]: { sourcePriority: ['source-b', 'source-a'], missingData: 'strict' } }
    });
    expect(result.changes).toContainEqual({ code: 'measurement-added', key: timeInBed.key, requiresResolution: false });
    expect(result.changes).toContainEqual({ code: 'measurement-added', key: sleep.key, requiresResolution: false });
  });

  it.each(['source-b', 'source-a'])(
    'blocks removal of a listed source (%s) without pruning or promoting',
    (removed) => {
      const next = createMeasurementCatalogue([a, b, c].filter((source) => source.connector !== removed));
      const result = updateReconciliationConfiguration(edited(), previous, next);
      expect(result.ok).toBe(false);
      expect(result.proposedConfiguration).toEqual(edited());
      expect(result.conflicts).toContainEqual({
        code: 'source-removed',
        key: sleep.key,
        connector: removed,
        requiresResolution: true
      });
      expect(result.problems).toContainEqual({
        code: 'unsupported-source',
        path: `/measurements/${sleep.key}/sourcePriority/${removed === 'source-b' ? 0 : 1}`,
        message: 'Source must declare this measurement key.'
      });
    }
  );

  it('reports removal of an excluded source without blocking or restoring it', () => {
    const next = createMeasurementCatalogue([registration('source-c', [heartRate]), a, b]);
    const result = updateReconciliationConfiguration(edited(), previous, next);
    expect(result.ok).toBe(true);
    expect(result.proposedConfiguration).toEqual(edited());
    expect(result.changes).toEqual([
      { code: 'source-removed', key: sleep.key, connector: 'source-c', requiresResolution: false }
    ]);
  });

  it('blocks shared-to-unique transitions and retains the obsolete preference for explicit deletion', () => {
    const next = createMeasurementCatalogue([
      a,
      registration('source-b', [heartRate]),
      registration('source-c', [heartRate])
    ]);
    const result = updateReconciliationConfiguration(edited(), previous, next);
    expect(result.ok).toBe(false);
    expect(result.proposedConfiguration).toEqual(edited());
    expect(result.conflicts).toContainEqual({ code: 'no-longer-shared', key: sleep.key, requiresResolution: true });
    expect(result.problems).toMatchObject([{ code: 'non-shared-key', path: `/measurements/${sleep.key}` }]);
  });

  it('reports removed measurements and all their sources without dropping saved preferences', () => {
    const next = createMeasurementCatalogue([a, b, c].map((set) => registration(set.connector, [heartRate])));
    const result = updateReconciliationConfiguration(edited(), previous, next);
    expect(result.ok).toBe(false);
    expect(result.proposedConfiguration).toEqual(edited());
    expect(result.changes).toEqual([
      { code: 'measurement-removed', key: sleep.key, requiresResolution: true },
      { code: 'source-removed', key: sleep.key, connector: 'source-a', requiresResolution: true },
      { code: 'source-removed', key: sleep.key, connector: 'source-b', requiresResolution: true },
      { code: 'source-removed', key: sleep.key, connector: 'source-c', requiresResolution: false }
    ]);
    expect(result.problems).toMatchObject([{ code: 'unknown-key', path: `/measurements/${sleep.key}` }]);
  });

  it('reports removal of a unique measurement without creating a conflict', () => {
    const baseline = createMeasurementCatalogue([registration('source-a', [timeInBed])]);
    const result = updateReconciliationConfiguration(
      { version: 1, measurements: {} },
      baseline,
      createMeasurementCatalogue([])
    );
    expect(result.ok).toBe(true);
    expect(result.changes).toContainEqual({
      code: 'measurement-removed',
      key: timeInBed.key,
      requiresResolution: false
    });
  });

  it.each(['description', 'valueType', 'canonicalUnit', 'scope', 'statistic'] as const)(
    'detects definition %s changes even without a version bump',
    (field) => {
      const next = structuredClone(previous);
      const entry = sleepEntry(next);
      switch (field) {
        case 'description':
          entry.definition.description = 'A changed measurement meaning.';
          break;
        case 'valueType':
          entry.definition.valueType = 'integer';
          for (const source of entry.sources) {
            for (const declaration of source.declarations) declaration.valueType = 'integer';
          }
          break;
        case 'canonicalUnit':
          entry.definition.canonicalUnit = 's';
          for (const source of entry.sources) {
            for (const declaration of source.declarations) declaration.unit = 's';
          }
          break;
        case 'scope':
          entry.definition.context.scope = 'daily';
          for (const source of entry.sources) {
            for (const declaration of source.declarations) declaration.context.scope = 'daily';
          }
          break;
        case 'statistic':
          entry.definition.context.statistic = 'mean';
          for (const source of entry.sources) {
            for (const declaration of source.declarations) declaration.context.statistic = 'mean';
          }
          break;
      }
      const result = updateReconciliationConfiguration(edited(), previous, next);
      expect(result.ok).toBe(false);
      expect(result.conflicts).toContainEqual({ code: 'definition-changed', key: sleep.key, requiresResolution: true });
      expect(result.proposedConfiguration).toEqual(edited());
    }
  );

  it.each(['system', 'code', 'location', 'parent-system', 'parent-code', 'addition', 'removal'] as const)(
    'detects declaration %s changes',
    (field) => {
      const component = declareMeasurement(
        'total-sleep-time',
        { system: SYSTEMS.OURA, code: 'synthetic-sleep' },
        { system: SYSTEMS.OURA, code: 'sleep' }
      );
      const baseline = createMeasurementCatalogue([registration('source-a', [sleep, component]), b]);
      const next = structuredClone(baseline);
      const source = sleepEntry(next).sources[0];
      const declaration = source?.declarations[1];
      if (!source || !declaration || declaration.location.kind !== 'component') throw new Error('Expected component');
      switch (field) {
        case 'system':
          declaration.coding.system = `${SYSTEMS.OURA}/synthetic-other`;
          break;
        case 'code':
          declaration.coding.code = 'synthetic-new-code';
          break;
        case 'location':
          declaration.location = { kind: 'observation' };
          break;
        case 'parent-system':
          declaration.location.parent.system = `${SYSTEMS.OURA}/synthetic-other`;
          break;
        case 'parent-code':
          declaration.location.parent.code = 'synthetic-new-parent';
          break;
        case 'addition':
          source.declarations.push(
            declareMeasurement('total-sleep-time', { system: SYSTEMS.OURA, code: 'synthetic-extra' })
          );
          break;
        case 'removal':
          source.declarations.pop();
          break;
      }
      const input = generateReconciliationConfiguration(baseline);
      const result = updateReconciliationConfiguration(input, baseline, next);
      expect(result.ok).toBe(false);
      expect(result.conflicts).toEqual([
        { code: 'declarations-changed', key: sleep.key, connector: 'source-a', requiresResolution: true }
      ]);
      expect(result.problems).toEqual([]);
    }
  );

  it('ignores declaration order, JSON property order and version-only bumps', () => {
    const baseline = createMeasurementCatalogue([
      registration('source-a', [
        sleep,
        declareMeasurement('total-sleep-time', { system: SYSTEMS.OURA, code: 'synthetic' })
      ]),
      b
    ]);
    const next: MeasurementCatalogue = JSON.parse(JSON.stringify(baseline));
    next.connectors.reverse();
    next.definitionsVersion += 1;
    for (const connector of next.connectors) connector.version += 1;
    next.entries.reverse();
    for (const entry of next.entries) {
      entry.sources.reverse();
      entry.definition = {
        context: entry.definition.context,
        canonicalUnit: entry.definition.canonicalUnit,
        valueType: entry.definition.valueType,
        description: entry.definition.description,
        key: entry.definition.key
      };
      for (const source of entry.sources) source.declarations.reverse();
    }
    const result = updateReconciliationConfiguration(generateReconciliationConfiguration(baseline), baseline, next);
    expect(result.ok).toBe(true);
    expect(result.changes).toEqual([]);
  });

  it('blocks catalogue schema changes without interpreting the new schema', () => {
    const next = structuredClone(previous);
    Object.assign(next, { schemaVersion: 2 });
    const result = updateReconciliationConfiguration(edited(), previous, next);
    expect(result.ok).toBe(false);
    expect(result.conflicts).toEqual([{ code: 'schema-changed', requiresResolution: true }]);
    expect(result.proposedConfiguration).toEqual(edited());
  });

  it('rejects invalid baseline preferences rather than repairing them using the new catalogue', () => {
    const input = edited();
    input.measurements[sleep.key] = { sourcePriority: ['new-source'], missingData: 'strict' };
    const next = createMeasurementCatalogue([a, b, c, registration('new-source', [sleep])]);
    const result = updateReconciliationConfiguration(input, previous, next);
    expect(result).toMatchObject({ ok: false, proposedConfiguration: null, changes: [], conflicts: [] });
    expect(result.problems).toMatchObject([{ code: 'unsupported-source' }]);
  });

  it('permits explicit caller resolution by editing and validating the blocked proposal', () => {
    const next = createMeasurementCatalogue([a, c]);
    const result = updateReconciliationConfiguration(edited(), previous, next);
    expect(result.ok).toBe(false);
    const proposal = result.proposedConfiguration;
    if (!proposal) throw new Error('Expected a blocked proposal');
    proposal.measurements[sleep.key] = { sourcePriority: ['source-a'], missingData: 'fallback' };
    expect(validateReconciliationConfiguration(proposal, next).ok).toBe(true);
  });

  it('returns detached output, never mutates frozen inputs, and is stable after JSON persistence', () => {
    const input = edited();
    const baseline: MeasurementCatalogue = JSON.parse(JSON.stringify(previous));
    const next = createMeasurementCatalogue([a, b, c, registration('source-d', [sleep])]);
    const before = JSON.stringify([input, baseline, next]);
    freeze(input);
    freeze(baseline);
    freeze(next);
    const first = updateReconciliationConfiguration(input, baseline, next);
    expect(first.ok).toBe(true);
    expect(first).toEqual(updateReconciliationConfiguration(input, baseline, next));
    first.proposedConfiguration?.measurements[sleep.key]?.sourcePriority.reverse();
    expect(JSON.stringify([input, baseline, next])).toBe(before);
    const proposal = updateReconciliationConfiguration(input, baseline, next).proposedConfiguration;
    if (!proposal) throw new Error('Expected a proposal');
    const restored: ReconciliationConfiguration = JSON.parse(JSON.stringify(proposal));
    const repeated = updateReconciliationConfiguration(restored, next, next);
    expect(repeated.ok).toBe(true);
    expect(repeated.changes).toEqual([]);
    expect(repeated.proposedConfiguration).toEqual(proposal);
  });
});
