import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { citiesFromDemographics, csvFields } from '../src/catalog.ts';
import { parseVersionLock, readSyntheaPin } from '../src/paths.ts';
import { checkRecipe, defaultRecipeInput, type Recipe } from '../src/recipe.ts';
import {
  cleanLine,
  contentChecksum,
  isPersonLine,
  parseRecordsLine,
  Runner,
  type RunRecord,
  readRun
} from '../src/runner.ts';
import { estimateSeconds, timingSamples } from '../src/timing.ts';

describe('contentChecksum', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cohort-checksum-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('equals `sha256sum *.json | sort | sha256sum` (value computed with coreutils)', () => {
    writeFileSync(join(dir, 'a.json'), 'a');
    writeFileSync(join(dir, 'b.json'), 'b');
    writeFileSync(join(dir, 'Zed_1.json'), '{"x":1}\n');
    writeFileSync(join(dir, 'notes.txt'), 'ignored');
    expect(contentChecksum(dir)).toBe('8a0e1de63fe1e563b3995c54144efdfd34eb84c35abeade9a3f7770f7c033d87');
  });
});

describe('Synthea output parsing', () => {
  it('reads the final records line', () => {
    expect(parseRecordsLine('Records: total=23, alive=20, dead=3')).toEqual({ total: 23, alive: 20, dead: 3 });
    expect(parseRecordsLine('Records: soon')).toBeNull();
  });
  it('recognises one simulated person per line', () => {
    expect(isPersonLine('2 -- Gustavo235 Lesch175 (51 y/o M) Whitman, Massachusetts DECEASED (68767)')).toBe(true);
    expect(isPersonLine('Scanned 92 modules and 449 submodules.')).toBe(false);
  });
  it('strips colour codes and terminal links', () => {
    expect(cleanLine('\u001b[32mYou have\u001b[0m a \u001b]8;;https://x.org\u0007link\u001b]8;;\u0007   ')).toBe(
      'You have a link'
    );
  });
});

describe('catalogue helpers', () => {
  it('reads quoted CSV fields', () => {
    expect(csvFields('35000,017,"Abanda, Town",Alabama,218', 4)).toEqual(['35000', '017', 'Abanda, Town', 'Alabama']);
  });
  it('lists cities per state, sorted and de-duplicated', () => {
    const csv =
      'ID,COUNTY,NAME,STNAME\n1,1,Boston,Massachusetts\n2,1,Amherst,Massachusetts\n3,2,Boston,Massachusetts\n4,1,Austin,Texas\n';
    expect(citiesFromDemographics(csv)).toEqual({ Massachusetts: ['Amherst', 'Boston'], Texas: ['Austin'] });
  });
  it('parses version.lock', () => {
    expect(
      parseVersionLock('# c\nSYNTHEA_VERSION=v4.0.0\nSYNTHEA_JAR_URL=https://x/y.jar\nSYNTHEA_JAR_SHA256=abc\n')
    ).toEqual({
      version: 'v4.0.0',
      jarUrl: 'https://x/y.jar',
      jarSha256: 'abc'
    });
  });
});

describe('estimateSeconds', () => {
  const recipe = (keep: string | null, population: number) =>
    ({
      keepModuleSha256: keep,
      state: 'Massachusetts',
      city: null,
      age: null,
      sex: 'any',
      referenceDate: '2026-01-01',
      endDate: '2026-01-01',
      customModules: [],
      population
    }) as unknown as Recipe;
  it('scales the per-person time of an earlier run of the same shape, after start-up', () => {
    const samples = timingSamples([
      { status: 'finished', elapsedMs: 30_000, recipe: recipe('k', 20) } as unknown as RunRecord
    ]);
    // (30 s - 10 s start-up) / 20 people = 1 s per person.
    expect(estimateSeconds(recipe('k', 50), samples).seconds).toBe(60);
  });
  it('falls back to the measured baseline without earlier runs', () => {
    expect(estimateSeconds(recipe(null, 100), []).seconds).toBe(31);
    expect(estimateSeconds(recipe('k', 100), []).seconds).toBeNull();
  });
});

describe('Runner', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'cohort-runs-'));
  const script = join(runsDir, 'fake-generate.sh');
  writeFileSync(script, 'echo "gender=$SYNTHEA_GENDER"\n');
  const recipe = (): Recipe => checkRecipe(defaultRecipeInput(), readSyntheaPin()).recipe as Recipe;
  afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

  it('marks runs left as running by an earlier process as failed', () => {
    const stale: RunRecord = {
      runId: '20260101-120000-deadbeef',
      status: 'running',
      startedAt: '2026-01-01T12:00:00.000Z',
      finishedAt: null,
      elapsedMs: null,
      recipe: recipe(),
      results: null,
      error: null
    };
    mkdirSync(join(runsDir, stale.runId));
    writeFileSync(join(runsDir, stale.runId, 'run.json'), JSON.stringify(stale));
    new Runner(runsDir, script);
    expect(readRun(stale.runId, runsDir)?.status).toBe('failed');
  });

  it('does not pass inherited SYNTHEA_* variables to generate.sh', async () => {
    process.env.SYNTHEA_GENDER = 'F';
    const runner = new Runner(runsDir, script);
    const lines: string[] = [];
    const run = await runner.wait(runner.start(recipe()).runId, (l) => lines.push(l));
    delete process.env.SYNTHEA_GENDER;
    expect(lines).toContain('gender=');
    expect(run.status).toBe('failed');
  });
});
