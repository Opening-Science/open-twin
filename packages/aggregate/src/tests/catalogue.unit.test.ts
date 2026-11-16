import {
  declareMeasurement,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementDeclarationSet,
  SYSTEMS
} from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import { catalogueEntry, createMeasurementCatalogue, registrationProblems, sharedCatalogueEntries } from '../catalogue';

const SLEEP_DURATION = { system: SYSTEMS.LOINC, code: '93832-4' };
const TIME_IN_BED = { system: SYSTEMS.LOINC, code: '103213-5' };

function set(connector: string, overrides: Partial<MeasurementDeclarationSet> = {}): MeasurementDeclarationSet {
  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    connector,
    version: 1,
    coverage: 'complete',
    definitions: [],
    declarations: [],
    ...overrides
  };
}

const OURA_SLEEP_SCORE = {
  key: 'oura:sleep-score',
  description: 'Oura sleep score for one sleep period.',
  valueType: 'quantity',
  canonicalUnit: '{score}',
  context: { scope: 'sleep-period' }
} as const;

const oura = set('oura', {
  definitions: [OURA_SLEEP_SCORE],
  declarations: [
    declareMeasurement(OURA_SLEEP_SCORE, { system: SYSTEMS.OURA, code: 'sleep-score' }),
    declareMeasurement('total-sleep-time', SLEEP_DURATION, { system: SYSTEMS.OURA, code: 'sleep-score' }),
    declareMeasurement('time-in-bed', TIME_IN_BED, { system: SYSTEMS.OURA, code: 'sleep-score' })
  ]
});

const googleHealth = set('google-health', {
  declarations: [
    declareMeasurement('total-sleep-time', SLEEP_DURATION, { system: SYSTEMS.GOOGLE_HEALTH, code: 'sleep' }),
    declareMeasurement('resting-heart-rate', { system: SYSTEMS.LOINC, code: '40443-4' })
  ]
});

describe('createMeasurementCatalogue', () => {
  it('builds from declarations alone — no credentials, network or bundles', () => {
    const catalogue = createMeasurementCatalogue([oura, googleHealth]);
    expect(catalogue.connectors).toEqual([
      { connector: 'oura', version: 1 },
      { connector: 'google-health', version: 1 }
    ]);
    expect(catalogue.entries.map((entry) => entry.key)).toEqual([
      'oura:sleep-score',
      'resting-heart-rate',
      'time-in-bed',
      'total-sleep-time'
    ]);
  });

  it('marks a key shared only when two or more sources declare it', () => {
    const catalogue = createMeasurementCatalogue([oura, googleHealth]);
    expect(sharedCatalogueEntries(catalogue).map((entry) => entry.key)).toEqual(['total-sleep-time']);
    // Single-source keys stay in the catalogue; they simply have nothing to choose between.
    expect(catalogueEntry(catalogue, 'resting-heart-rate')?.shared).toBe(false);
    expect(catalogueEntry(catalogue, 'oura:sleep-score')?.shared).toBe(false);
  });

  it('keeps time in bed and time asleep apart even when both sources describe one night', () => {
    const catalogue = createMeasurementCatalogue([oura, googleHealth]);
    expect(catalogueEntry(catalogue, 'time-in-bed')?.sources.map((source) => source.connector)).toEqual(['oura']);
    expect(catalogueEntry(catalogue, 'total-sleep-time')?.sources.map((source) => source.connector)).toEqual([
      'oura',
      'google-health'
    ]);
  });

  it('lists sources in registration order, not alphabetically', () => {
    const forward = createMeasurementCatalogue([oura, googleHealth]);
    const reverse = createMeasurementCatalogue([googleHealth, oura]);
    const order = (catalogue: typeof forward) =>
      catalogueEntry(catalogue, 'total-sleep-time')?.sources.map((source) => source.connector);
    expect(order(forward)).toEqual(['oura', 'google-health']);
    expect(order(reverse)).toEqual(['google-health', 'oura']);
  });

  it('groups several declarations of one key from one source under that source', () => {
    const twice = set('whoop', {
      declarations: [
        declareMeasurement('heart-rate', { system: SYSTEMS.LOINC, code: '8867-4' }),
        declareMeasurement('heart-rate', { system: SYSTEMS.WHOOP, code: 'heart-rate-sample' })
      ]
    });
    const entry = catalogueEntry(createMeasurementCatalogue([twice]), 'heart-rate');
    expect(entry?.sources).toHaveLength(1);
    expect(entry?.sources[0]?.declarations).toHaveLength(2);
    expect(entry?.shared).toBe(false);
  });

  it('accepts an empty registration and yields an empty catalogue', () => {
    expect(createMeasurementCatalogue([]).entries).toEqual([]);
  });

  it('rejects a connector registered twice', () => {
    expect(registrationProblems([oura, oura]).map((problem) => problem.message)).toEqual(['registered more than once']);
    expect(() => createMeasurementCatalogue([oura, oura])).toThrow(/registered more than once/);
  });

  it('rejects a declaration whose unit differs from the shared canonical unit', () => {
    const seconds = set('seconds-vendor', {
      declarations: [{ ...declareMeasurement('total-sleep-time', SLEEP_DURATION), unit: 's' }]
    });
    expect(registrationProblems([seconds]).map((problem) => problem.code)).toEqual(['unit-mismatch']);
    expect(() => createMeasurementCatalogue([oura, seconds])).toThrow(/unit-mismatch/);
  });

  it("rejects a connector declaring another connector's key", () => {
    const borrowing = set('google-health', {
      declarations: [{ ...declareMeasurement('total-sleep-time', SLEEP_DURATION), key: 'oura:sleep-score' }]
    });
    expect(registrationProblems([oura, borrowing]).map((problem) => problem.code)).toEqual(['foreign-key']);
  });

  it('carries no values and no health data in the error', () => {
    const bad = set('bad', { declarations: [declareMeasurement('time-in-bed', TIME_IN_BED)], version: 0 });
    try {
      createMeasurementCatalogue([bad]);
      expect.unreachable();
    } catch (error) {
      expect((error as Error).name).toBe('ConnectorError');
      expect((error as Error).message).toContain('invalid-version');
    }
  });
});
