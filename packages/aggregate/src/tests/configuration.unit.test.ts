import { declareMeasurement, SYSTEMS } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import {
  type ConfigurationProblem,
  createMeasurementCatalogue,
  generateReconciliationConfiguration,
  RECONCILIATION_CONFIGURATION_VERSION,
  type ReconciliationConfiguration,
  validateReconciliationConfiguration
} from '../index';
import { registration } from './configuration-fixtures';

const sleep = declareMeasurement('total-sleep-time', { system: SYSTEMS.LOINC, code: '93832-4' });
const restingHeartRate = declareMeasurement('resting-heart-rate', { system: SYSTEMS.LOINC, code: '40443-4' });
const timeInBed = declareMeasurement('time-in-bed', { system: SYSTEMS.LOINC, code: '103213-5' });

const oura = registration('oura', [sleep, restingHeartRate, timeInBed]);
const google = registration('google-health', [sleep, restingHeartRate]);
const whoop = registration('whoop', [restingHeartRate]);
const catalogue = createMeasurementCatalogue([whoop, oura, google]);

function configuration(): ReconciliationConfiguration {
  return {
    version: 1,
    measurements: {
      'resting-heart-rate': { sourcePriority: ['whoop', 'oura', 'google-health'], missingData: 'strict' },
      'total-sleep-time': { sourcePriority: ['oura', 'google-health'], missingData: 'strict' }
    }
  };
}

function errors(input: unknown): ConfigurationProblem[] {
  // Deliberately malformed fixtures exercise runtime guards despite the typed API.
  const result = validateReconciliationConfiguration(input as ReconciliationConfiguration, catalogue);
  if (result.ok) throw new Error('Expected invalid configuration');
  return result.problems;
}

describe('generateReconciliationConfiguration', () => {
  it('uses only declarations, generates all and only shared keys, and defaults to strict', () => {
    expect(RECONCILIATION_CONFIGURATION_VERSION).toBe(1);
    expect(generateReconciliationConfiguration(catalogue)).toEqual(configuration());
  });

  it('prefers the first registered source supporting each key, not the alphabetically first', () => {
    const reversed = createMeasurementCatalogue([google, oura, whoop]);
    expect(generateReconciliationConfiguration(reversed).measurements).toEqual({
      'resting-heart-rate': { sourcePriority: ['google-health', 'oura', 'whoop'], missingData: 'strict' },
      'total-sleep-time': { sourcePriority: ['google-health', 'oura'], missingData: 'strict' }
    });
  });

  it('generates a valid empty configuration for no registrations or only unique keys', () => {
    for (const current of [createMeasurementCatalogue([]), createMeasurementCatalogue([oura])]) {
      const generated = generateReconciliationConfiguration(current);
      expect(generated).toEqual({ version: 1, measurements: {} });
      expect(validateReconciliationConfiguration(generated, current).ok).toBe(true);
    }
  });

  it('does not count multiple declarations from the same source as shared support', () => {
    const current = createMeasurementCatalogue([
      registration('oura', [
        sleep,
        declareMeasurement('total-sleep-time', { system: SYSTEMS.OURA, code: 'sleep-duration' })
      ])
    ]);
    expect(generateReconciliationConfiguration(current).measurements).toEqual({});
  });

  it('returns independently editable arrays and objects without modifying the catalogue', () => {
    const before = JSON.stringify(catalogue);
    const first = generateReconciliationConfiguration(catalogue);
    const preference = first.measurements['total-sleep-time'];
    if (!preference) throw new Error('Expected generated sleep preference');
    preference.sourcePriority.reverse();
    preference.missingData = 'fallback';
    first.measurements = {};
    expect(generateReconciliationConfiguration(catalogue)).toEqual(configuration());
    expect(JSON.stringify(catalogue)).toBe(before);
  });
});

describe('validateReconciliationConfiguration', () => {
  it('accepts user-edited order, a supporting-source subset, and a different mode for each key', () => {
    const edited = configuration();
    edited.measurements['total-sleep-time'] = { sourcePriority: ['google-health'], missingData: 'fallback' };
    edited.measurements['resting-heart-rate'] = {
      sourcePriority: ['google-health', 'oura', 'whoop'],
      missingData: 'strict'
    };
    const before = JSON.stringify(edited);
    const result = validateReconciliationConfiguration(edited, catalogue);
    expect(result).toEqual({ ok: true, configuration: edited });
    expect(JSON.stringify(edited)).toBe(before);
    if (!result.ok) throw new Error('Expected valid edited configuration');
    result.configuration.measurements['total-sleep-time']?.sourcePriority.push('oura');
    expect(JSON.stringify(edited)).toBe(before);
  });

  it('preserves generated and edited preferences through JSON serialization and deserialization', () => {
    const edited = configuration();
    edited.measurements['total-sleep-time'] = {
      sourcePriority: ['google-health', 'oura'],
      missingData: 'fallback'
    };
    for (const original of [generateReconciliationConfiguration(catalogue), edited]) {
      const decoded: ReconciliationConfiguration = JSON.parse(JSON.stringify(original));
      const result = validateReconciliationConfiguration(decoded, catalogue);
      expect(result).toEqual({ ok: true, configuration: original });
      if (!result.ok) throw new Error('Expected valid round trip');
      expect(JSON.stringify(result.configuration)).toBe(JSON.stringify(original));
    }
  });

  it.each([undefined, null, [], 'configuration', 1, true, new Date(0)])('rejects invalid root shape: %j', (input) => {
    expect(errors(input)).toMatchObject([{ code: 'invalid-shape', path: '' }]);
  });

  it.each([undefined, null, 0, 2, '1'])('rejects unsupported or missing version: %j', (version) => {
    expect(errors({ ...configuration(), version })).toMatchObject([{ code: 'unsupported-version', path: '/version' }]);
  });

  it.each([undefined, null, [], 'measurements', 1])('rejects invalid measurements shape: %j', (measurements) => {
    expect(errors({ ...configuration(), measurements })).toMatchObject([
      { code: 'invalid-shape', path: '/measurements' }
    ]);
  });

  it.each([null, [], 'preference', 1])('rejects invalid preference shape: %j', (preference) => {
    const input = {
      ...configuration(),
      measurements: { ...configuration().measurements, 'total-sleep-time': preference }
    };
    expect(errors(input)).toMatchObject([{ code: 'invalid-shape', path: '/measurements/total-sleep-time' }]);
  });

  it.each([undefined, null, 'automatic', '', true, 1])('rejects invalid or missing modes: %j', (missingData) => {
    const input = configuration();
    const measurements = {
      ...input.measurements,
      'total-sleep-time': { ...input.measurements['total-sleep-time'], missingData }
    };
    expect(errors({ ...input, measurements })).toMatchObject([
      { code: 'invalid-mode', path: '/measurements/total-sleep-time/missingData' }
    ]);
  });

  it.each([
    { sourcePriority: undefined, code: 'invalid-shape' },
    { sourcePriority: null, code: 'invalid-shape' },
    { sourcePriority: 'oura', code: 'invalid-shape' },
    { sourcePriority: [], code: 'empty-priority' },
    { sourcePriority: ['oura', 'oura'], code: 'duplicate-source' },
    { sourcePriority: ['unknown'], code: 'unsupported-source' },
    { sourcePriority: ['whoop'], code: 'unsupported-source' },
    { sourcePriority: [null], code: 'invalid-source' },
    { sourcePriority: [1], code: 'invalid-source' },
    { sourcePriority: [{}], code: 'invalid-source' },
    { sourcePriority: [''], code: 'invalid-source' }
  ])('rejects invalid priority: $sourcePriority ($code)', ({ sourcePriority, code }) => {
    const input = configuration();
    const measurements = {
      ...input.measurements,
      'total-sleep-time': { ...input.measurements['total-sleep-time'], sourcePriority }
    };
    expect(errors({ ...input, measurements })).toMatchObject([{ code }]);
  });

  it('requires every shared key, without filling in missing preferences', () => {
    expect(errors({ version: 1, measurements: {} })).toMatchObject([
      { code: 'missing-key', path: '/measurements/resting-heart-rate' },
      { code: 'missing-key', path: '/measurements/total-sleep-time' }
    ]);
  });

  it.each([
    { key: 'sleep-time', code: 'unknown-key' },
    { key: 'time-in-bed', code: 'non-shared-key' },
    { key: '__proto__', code: 'unknown-key' },
    { key: 'constructor', code: 'unknown-key' }
  ])('rejects configuration for $key ($code)', ({ key, code }) => {
    const input = configuration();
    const measurements = { ...input.measurements, [key]: input.measurements['total-sleep-time'] };
    expect(errors({ ...input, measurements })).toMatchObject([{ code, path: `/measurements/${key}` }]);
  });

  it('escapes JSON Pointer segments in error paths', () => {
    const input = configuration();
    const measurements = { ...input.measurements, 'unknown/key~': {} };
    expect(errors({ ...input, measurements })).toMatchObject([
      { code: 'unknown-key', path: '/measurements/unknown~1key~0' }
    ]);
  });

  it('reports extra fields rather than silently discarding misspelled settings', () => {
    const input = configuration();
    const measurements = {
      ...input.measurements,
      'total-sleep-time': { ...input.measurements['total-sleep-time'], missingDat: 'fallback' }
    };
    expect(errors({ ...input, measurements, extra: true })).toMatchObject([
      { code: 'unexpected-field', path: '/extra' },
      { code: 'unexpected-field', path: '/measurements/total-sleep-time/missingDat' }
    ]);
  });

  it('returns multiple explicit problems without mutating input or echoing invalid values', () => {
    const input = {
      ...configuration(),
      version: 2,
      measurements: {
        ...configuration().measurements,
        'total-sleep-time': {
          sourcePriority: ['private-invalid-value', 'private-invalid-value'],
          missingData: 'private-invalid-mode'
        }
      }
    };
    const before = JSON.stringify(input);
    const problems = errors(input);
    expect(problems.map((problem) => problem.code)).toEqual([
      'unsupported-version',
      'invalid-mode',
      'unsupported-source',
      'duplicate-source',
      'unsupported-source'
    ]);
    expect(JSON.stringify(problems)).not.toContain('private-invalid');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('does not append newly registered sources or replace saved priorities', () => {
    const original = generateReconciliationConfiguration(createMeasurementCatalogue([oura, google]));
    expect(validateReconciliationConfiguration(original, catalogue)).toEqual({ ok: true, configuration: original });
  });

  it('reports configuration made incompatible by removing a source', () => {
    const current = createMeasurementCatalogue([oura, google]);
    const result = validateReconciliationConfiguration(configuration(), current);
    expect(result).toMatchObject({
      ok: false,
      problems: [{ code: 'unsupported-source', path: '/measurements/resting-heart-rate/sourcePriority/0' }]
    });
  });
});
