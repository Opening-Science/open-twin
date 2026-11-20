import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Observation } from 'fhir/r4.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runOuraGoogleExample } from './oura-google-catalogue';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'open-twin-aggregation-example-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('the Oura + Google Health workflow example', () => {
  it('persists the full catalogue, preferences, connector bundles and both aggregation paths', () => {
    const result = runOuraGoogleExample(directory);
    expect(readdirSync(directory).sort()).toEqual([
      'basic-result.json',
      'catalogue.json',
      'configuration-history',
      'google-health-bundle.json',
      'oura-bundle.json',
      'reconciled-result.json',
      'reconciliation-configuration.json'
    ]);
    if (!result.savedConfigurationPath) throw new Error('Expected a generated configuration snapshot');
    expect(readFileSync(result.savedConfigurationPath, 'utf8')).toBe(
      `${JSON.stringify(result.configuration, null, 2)}\n`
    );
    expect(Object.keys(result.configuration.measurements).sort()).toEqual(
      result.catalogue.entries.filter(({ shared }) => shared).map(({ key }) => key)
    );
    expect(result.configuration.measurements['deep-sleep-duration']).toEqual({
      sourcePriority: ['oura', 'google-health'],
      missingData: 'strict'
    });
    expect(result.basic.reconciliationStatus).toBe('disabled');
    expect(result.basic.reconciliations).toEqual([]);
    expect(result.reconciled.reconciliationStatus).toBe('completed');
    for (const source of result.sources) {
      for (const entry of source.bundle.entry ?? []) {
        expect(result.basic.bundle.entry).toContainEqual(entry);
        expect(result.reconciled.bundle.entry).toContainEqual(entry);
      }
    }
    expect(JSON.parse(readFileSync(join(directory, 'reconciled-result.json'), 'utf8'))).toEqual(
      JSON.parse(JSON.stringify(result.reconciled))
    );
  });

  it('selects Oura for the matching night and abstains when only Google reports the next night', () => {
    const { reconciled } = runOuraGoogleExample(directory);
    const decisions = reconciled.reconciliations.filter(({ key }) => key === 'deep-sleep-duration');
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toMatchObject({
      selected: 'oura',
      outcome: 'selected',
      window: { start: '2026-11-16T22:00:00Z', end: '2026-11-17T06:00:00Z' }
    });
    expect(decisions[1]).toMatchObject({ outcome: 'abstained', reason: 'no-eligible-reading' });
    expect(decisions[1]?.selected).toBeUndefined();
    const observations = reconciled.bundle.entry
      ?.map(({ resource }) => resource)
      .filter((resource): resource is Observation => resource?.resourceType === 'Observation');
    expect(
      observations?.some(
        (resource) =>
          resource.derivedFrom?.length === 2 &&
          resource.valueQuantity?.value === 60 &&
          resource.valueQuantity.code === 'min' &&
          resource.effectivePeriod?.start === '2026-11-16T23:00:00+01:00'
      )
    ).toBe(true);
  });

  it.each(['oura', 'google-health'])(
    'reuses edited %s-first fallback preferences without overwriting the file',
    (first) => {
      const initial = runOuraGoogleExample(directory);
      initial.configuration.measurements['deep-sleep-duration'] = {
        sourcePriority: first === 'oura' ? ['oura', 'google-health'] : ['google-health', 'oura'],
        missingData: 'fallback'
      };
      const saved = `${JSON.stringify(initial.configuration)}\n`;
      const path = join(directory, 'reconciliation-configuration.json');
      writeFileSync(path, saved);
      const result = runOuraGoogleExample(directory);
      const decisions = result.reconciled.reconciliations.filter(({ key }) => key === 'deep-sleep-duration');
      expect(decisions[0]?.selected).toBe(first);
      expect(decisions[1]).toMatchObject({
        selected: 'google-health',
        outcome: first === 'oura' ? 'fallback' : 'selected'
      });
      expect(readFileSync(path, 'utf8')).toBe(saved);
    }
  );

  it.each(['{"version":1,"measurements":{}}', '{'])(
    'rejects invalid saved configuration without replacing it or prior results: %s',
    (invalid) => {
      runOuraGoogleExample(directory);
      const configurationPath = join(directory, 'reconciliation-configuration.json');
      const resultPath = join(directory, 'reconciled-result.json');
      const previous = readFileSync(resultPath, 'utf8');
      writeFileSync(configurationPath, invalid);
      expect(() => runOuraGoogleExample(directory)).toThrow();
      expect(readFileSync(configurationPath, 'utf8')).toBe(invalid);
      expect(readFileSync(resultPath, 'utf8')).toBe(previous);
    }
  );

  it('produces identical files on an unchanged rerun', () => {
    runOuraGoogleExample(directory);
    const previous = Object.fromEntries(
      readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map(({ name }) => [name, readFileSync(join(directory, name), 'utf8')])
    );
    const history = readdirSync(join(directory, 'configuration-history'));
    runOuraGoogleExample(directory);
    expect(readdirSync(join(directory, 'configuration-history'))).toEqual(history);
    for (const [name, contents] of Object.entries(previous)) {
      expect(readFileSync(join(directory, name), 'utf8')).toBe(contents);
    }
  });
});
