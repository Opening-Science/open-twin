import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { ConnectorError, declareMeasurement, SYSTEMS } from '@open-twin/fhir-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMeasurementCatalogue,
  generateReconciliationConfiguration,
  validateReconciliationConfiguration
} from '../index';
import { registration } from './configuration-fixtures';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

const sleep = declareMeasurement('total-sleep-time', { system: SYSTEMS.LOINC, code: '93832-4' });
const catalogue = createMeasurementCatalogue([registration('oura', [sleep]), registration('google-health', [sleep])]);
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'open-twin-configuration-save-'));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T15:31:37.711Z'));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(directory, { recursive: true, force: true });
});

describe('explicit configuration saving', () => {
  it('keeps default generation storage-free with the original return shape', () => {
    const configuration = generateReconciliationConfiguration(catalogue);
    expect(configuration.version).toBe(1);
    expect(configuration).not.toHaveProperty('filePath');
    expect(readdirSync(directory)).toEqual([]);
  });

  it('creates a timestamped JSON snapshot and returns its absolute path separately', () => {
    const destination = join(directory, 'nested', 'history');
    const before = structuredClone(catalogue);
    const saved = generateReconciliationConfiguration(catalogue, { save: { directory: destination } });
    expect(isAbsolute(saved.filePath)).toBe(true);
    expect(basename(saved.filePath)).toMatch(
      /^reconciliation-configuration-2026-11-18T15-31-37-711Z-[0-9a-f-]{36}\.json$/
    );
    expect(readFileSync(saved.filePath, 'utf8')).toBe(`${JSON.stringify(saved.configuration, null, 2)}\n`);
    expect(saved.configuration).toEqual(generateReconciliationConfiguration(catalogue));
    expect(validateReconciliationConfiguration(JSON.parse(readFileSync(saved.filePath, 'utf8')), catalogue).ok).toBe(
      true
    );
    expect(catalogue).toEqual(before);
  });

  it('creates distinct snapshots even within the same millisecond and preserves earlier edits', () => {
    const first = generateReconciliationConfiguration(catalogue, { save: { directory } });
    const edited = {
      ...first.configuration,
      measurements: {
        'total-sleep-time': {
          sourcePriority: ['google-health', 'oura'],
          missingData: 'fallback'
        }
      }
    };
    const contents = JSON.stringify(edited);
    writeFileSync(first.filePath, contents);
    const second = generateReconciliationConfiguration(catalogue, { save: { directory } });
    expect(second.filePath).not.toBe(first.filePath);
    expect(readdirSync(directory)).toHaveLength(2);
    expect(readFileSync(first.filePath, 'utf8')).toBe(contents);
    expect(second.configuration).toEqual(generateReconciliationConfiguration(catalogue));
  });

  it('fails instead of overwriting if a timestamp and UUID collide', () => {
    vi.mocked(randomUUID).mockReturnValue('00000000-0000-4000-8000-000000000001');
    const saved = generateReconciliationConfiguration(catalogue, { save: { directory } });
    writeFileSync(saved.filePath, 'private-configuration-marker');
    expect(() => generateReconciliationConfiguration(catalogue, { save: { directory } })).toThrowError(
      expect.objectContaining({ code: 'EEXIST' })
    );
    expect(readFileSync(saved.filePath, 'utf8')).toBe('private-configuration-marker');
  });

  it.each(['', '   '])('explicitly rejects an empty save directory: %j', (invalid) => {
    expect(() => generateReconciliationConfiguration(catalogue, { save: { directory: invalid } })).toThrowError(
      expect.objectContaining({ constructor: ConnectorError, code: 'validation' })
    );
  });

  it('surfaces filesystem failures rather than returning an unsaved success', () => {
    const blocked = join(directory, 'not-a-directory');
    writeFileSync(blocked, 'existing');
    expect(() => generateReconciliationConfiguration(catalogue, { save: { directory: blocked } })).toThrow();
    expect(readFileSync(blocked, 'utf8')).toBe('existing');
  });
});
