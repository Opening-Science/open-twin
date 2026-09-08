import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateFhir } from '../validate/validate';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/synthea');

function loadBundles(): unknown[] {
  return readdirSync(fixtureDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')));
}

describe('synthea trimmed fixtures', () => {
  const bundles = loadBundles();

  it('ships exactly three patient bundles', () => {
    expect(bundles).toHaveLength(3);
  });

  it.each(bundles.map((bundle, index) => [index + 1, bundle] as const))(
    'patient-%s is a collection Bundle with one Patient and Observations',
    (_n, bundle) => {
      expect(bundle).toMatchObject({ resourceType: 'Bundle', type: 'collection' });
      const entries = (bundle as { entry?: Array<{ resource?: { resourceType?: string } }> }).entry ?? [];
      expect(entries.filter((e) => e.resource?.resourceType === 'Patient')).toHaveLength(1);
      expect(entries.filter((e) => e.resource?.resourceType === 'Observation').length).toBeGreaterThan(0);
    }
  );

  it('each fixture passes structural validateFhir with no errors', () => {
    for (const bundle of bundles) {
      const result = validateFhir(bundle);
      expect(result.issues.filter((i) => i.severity === 'error' || i.severity === 'fatal')).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });
});
