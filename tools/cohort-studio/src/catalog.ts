/**
 * WHAT: Reads the picker catalogue (conditions from built-in modules, cities per state) out of the pinned Synthea JAR.
 * NOT:  Does not ship or cache SNOMED CT content in the repository; everything is read from the local JAR at start-up.
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { type CatalogCondition, extractConditions, readJarModules } from './conditions.ts';
import { readZipEntries } from './zip.ts';

export type Catalog = { conditions: CatalogCondition[]; moduleFiles: number; cities: Record<string, string[]> };

/** First `n` fields of one CSV line, honouring double quotes. */
export function csvFields(line: string, n: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (out.length < n && i <= line.length) {
    if (line[i] === '"') {
      const end = line.indexOf('"', i + 1);
      out.push(line.slice(i + 1, end === -1 ? undefined : end));
      i = (end === -1 ? line.length : end) + 2;
    } else {
      const end = line.indexOf(',', i);
      out.push(line.slice(i, end === -1 ? undefined : end));
      i = end === -1 ? line.length + 1 : end + 1;
    }
  }
  return out;
}

/** Cities Synthea can place people in, keyed by state, from geography/demographics.csv (NAME, STNAME). */
export function citiesFromDemographics(csv: string): Record<string, string[]> {
  const byState = new Map<string, Set<string>>();
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [, , name, state] = csvFields(line, 4);
    if (!name || !state) continue;
    const set = byState.get(state) ?? new Set<string>();
    set.add(name);
    byState.set(state, set);
  }
  const out: Record<string, string[]> = {};
  for (const [state, set] of [...byState.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out[state] = [...set].sort((a, b) => a.localeCompare(b, 'en'));
  }
  return out;
}

export function loadCatalog(jarPath: string): Catalog {
  const modules = readJarModules(jarPath);
  const demographics = readZipEntries(jarPath, (n) => n === 'geography/demographics.csv').get(
    'geography/demographics.csv'
  );
  return {
    conditions: extractConditions(modules),
    moduleFiles: modules.length,
    cities: demographics ? citiesFromDemographics(demographics.toString('utf8')) : {}
  };
}
