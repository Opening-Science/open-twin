import { describe, expect, it } from 'vitest';
import { buildKeepModule, keepModuleText, sha256Hex } from '../src/keep-module.ts';
import { checkRecipe, customModuleText, generateCommand, isCalendarDate, recipeEnv } from '../src/recipe.ts';

const PIN = { version: 'v4.0.0', jarSha256: 'a'.repeat(64), configSha256: 'b'.repeat(64) };
const HTN = { code: '59621000', display: 'Essential hypertension (disorder)' };

const base = () => ({
  population: 20,
  seed: 42,
  clinicianSeed: 43,
  state: 'Massachusetts',
  city: null,
  age: { min: 40, max: 75 },
  sex: 'any',
  referenceDate: '2026-01-01',
  endDate: '2026-01-01',
  conditions: { match: 'any', chosen: [HTN] },
  customModules: []
});

const errorsOf = (patch: Record<string, unknown>) => checkRecipe({ ...base(), ...patch }, PIN).errors;

describe('checkRecipe: valid input', () => {
  it('normalises form strings and records the pin and keep-module hash', () => {
    const { recipe, errors } = checkRecipe(
      { ...base(), population: '20', seed: '42', age: { min: '40', max: '75' } },
      PIN
    );
    expect(errors).toEqual([]);
    expect(recipe?.population).toBe(20);
    expect(recipe?.age).toEqual({ min: 40, max: 75 });
    expect(recipe?.synthea).toEqual(PIN);
    const keep = buildKeepModule([HTN], 'any');
    if (!keep) throw new Error('expected keep module');
    expect(recipe?.keepModuleSha256).toBe(sha256Hex(keepModuleText(keep)));
  });

  it('has no keep module when no condition is chosen', () => {
    const { recipe } = checkRecipe({ ...base(), conditions: { match: 'any', chosen: [] } }, PIN);
    expect(recipe?.keepModuleSha256).toBeNull();
  });
});

describe('checkRecipe: ages', () => {
  it('accepts no age limit', () => {
    expect(checkRecipe({ ...base(), age: null }, PIN).recipe?.age).toBeNull();
  });
  it('rejects a minimum above the maximum', () => {
    expect(errorsOf({ age: { min: 75, max: 40 } })).toEqual(['The youngest age must not be above the oldest age.']);
  });
  it('rejects ages outside 0 to 140', () => {
    expect(errorsOf({ age: { min: -1, max: 40 } })).toEqual(['Ages must be between 0 and 140.']);
    expect(errorsOf({ age: { min: 40, max: 141 } })).toEqual(['Ages must be between 0 and 140.']);
  });
  it('rejects only one of the two ages', () => {
    expect(errorsOf({ age: { min: 40, max: '' } })).toEqual([
      'Give both the youngest and the oldest age, or leave both empty for all ages.'
    ]);
  });
});

describe('checkRecipe: dates', () => {
  it('rejects a day that does not exist', () => {
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(errorsOf({ referenceDate: '2026-02-30' })).toEqual([
      'Reference date must be a real date written YYYY-MM-DD.'
    ]);
  });
  it('rejects other date formats', () => {
    expect(errorsOf({ endDate: '20260101' })).toEqual(['End date must be a real date written YYYY-MM-DD.']);
  });
  it('rejects an end date before the reference date', () => {
    expect(errorsOf({ referenceDate: '2026-01-02', endDate: '2026-01-01' })).toEqual([
      'End date must not be before the reference date.'
    ]);
  });
  it('rejects years outside 1900 to 2100', () => {
    expect(errorsOf({ referenceDate: '1899-12-31' })).toEqual(['Reference date must be between 1900 and 2100.']);
  });
});

describe('checkRecipe: population, seeds and place', () => {
  it.each([0, 10_001, 2.5, 'many', null])('rejects population %s', (population) => {
    expect(errorsOf({ population })).toEqual(['Population must be a whole number from 1 to 10000.']);
  });
  it.each([1, 10_000])('accepts population %s', (population) => {
    expect(errorsOf({ population })).toEqual([]);
  });
  it('rejects negative seeds', () => {
    expect(errorsOf({ seed: -1 })).toEqual(['Seed must be a whole number from 0 to 2147483647.']);
  });
  it('rejects an unknown state and a city with odd characters', () => {
    expect(errorsOf({ state: 'Atlantis' })).toEqual(['Choose a US state (or the District of Columbia).']);
    expect(errorsOf({ city: 'Boston; rm -rf' })).toEqual([
      'City may only contain letters, spaces, dots, apostrophes and hyphens.'
    ]);
  });
  it('rejects a sex other than any, F or M', () => {
    expect(errorsOf({ sex: 'X' })).toEqual(['Sex must be any, F or M.']);
  });
  it('warns when the recipe was written for another Synthea version', () => {
    const { warnings, recipe } = checkRecipe({ ...base(), synthea: { ...PIN, version: 'v3.3.0' } }, PIN);
    expect(recipe).not.toBeNull();
    expect(warnings).toEqual([
      'This recipe was written for Synthea v3.3.0; this checkout runs v4.0.0. The people will differ.'
    ]);
  });
});

describe('checkRecipe: custom modules', () => {
  const module = {
    name: 'Flu',
    states: { Initial: { type: 'Initial', direct_transition: 'T' }, T: { type: 'Terminal' } }
  };
  it('accepts a module with an Initial state and records the sha256 of the written file', () => {
    const { recipe } = checkRecipe({ ...base(), customModules: [{ name: 'flu.json', module }] }, PIN);
    expect(recipe?.customModules).toEqual([{ name: 'flu.json', sha256: sha256Hex(customModuleText(module)), module }]);
  });
  it('rejects JSON without states, a path as a name, and a wrong recorded hash', () => {
    expect(errorsOf({ customModules: [{ name: 'x.json', module: { name: 'x' } }] })).toEqual([
      'Custom module "x.json" has no "states".'
    ]);
    expect(errorsOf({ customModules: [{ name: '../x.json', module }] })).toEqual([
      'Custom module "../x.json" needs a plain file name ending in .json.'
    ]);
    expect(errorsOf({ customModules: [{ name: 'x.json', module, sha256: '0'.repeat(64) }] })).toEqual([
      'Custom module "x.json" does not match the sha256 recorded in the recipe.'
    ]);
  });
});

describe('recipe hash', () => {
  const hash = (patch: Record<string, unknown>) => checkRecipe({ ...base(), ...patch }, PIN).recipe?.recipeSha256;

  it('is stable for the same inputs and independent of condition order', () => {
    const t2d = { code: '44054006', display: 'Diabetes mellitus type 2 (disorder)' };
    expect(hash({})).toBe(hash({}));
    expect(hash({ conditions: { match: 'any', chosen: [HTN, t2d] } })).toBe(
      hash({ conditions: { match: 'any', chosen: [t2d, HTN] } })
    );
  });

  it('changes when the reference date changes', () => {
    expect(hash({ referenceDate: '2026-01-01' })).not.toBe(hash({ referenceDate: '2025-12-31' }));
  });

  it.each([
    ['endDate', '2026-06-01'],
    ['seed', 7],
    ['clinicianSeed', 8],
    ['population', 21],
    ['sex', 'F'],
    ['age', { min: 41, max: 75 }],
    ['city', 'Boston'],
    [
      'conditions',
      { match: 'all', chosen: [HTN, { code: '44054006', display: 'Diabetes mellitus type 2 (disorder)' }] }
    ]
  ])('changes when %s changes', (key, value) => {
    expect(hash({ [key]: value })).not.toBe(hash({}));
  });

  it('changes with the Synthea pin', () => {
    const other = checkRecipe(base(), { ...PIN, configSha256: 'c'.repeat(64) }).recipe?.recipeSha256;
    expect(other).not.toBe(hash({}));
  });
});

describe('generate.sh inputs', () => {
  it('maps a recipe to the exact environment', () => {
    const { recipe } = checkRecipe({ ...base(), sex: 'F', city: 'Boston' }, PIN);
    if (!recipe) throw new Error('expected recipe');
    expect(recipeEnv(recipe, { outDir: '/r/out', keepModule: '/r/keep.json', modulesDir: null })).toEqual({
      SYNTHEA_POPULATION: '20',
      SYNTHEA_SEED: '42',
      SYNTHEA_CLINICIAN_SEED: '43',
      SYNTHEA_STATE: 'Massachusetts',
      SYNTHEA_CITY: 'Boston',
      SYNTHEA_REFERENCE_DATE: '20260101',
      SYNTHEA_END_DATE: '20260101',
      SYNTHEA_AGE: '40-75',
      SYNTHEA_GENDER: 'F',
      SYNTHEA_KEEP_MODULE: '/r/keep.json',
      SYNTHEA_OUT_DIR: '/r/out'
    });
    expect(generateCommand(recipe)).toBe(
      'SYNTHEA_POPULATION=20 SYNTHEA_SEED=42 SYNTHEA_CLINICIAN_SEED=43 SYNTHEA_STATE=Massachusetts ' +
        'SYNTHEA_REFERENCE_DATE=20260101 SYNTHEA_END_DATE=20260101 SYNTHEA_OUT_DIR=my-cohort SYNTHEA_CITY=Boston ' +
        'SYNTHEA_AGE=40-75 SYNTHEA_GENDER=F SYNTHEA_KEEP_MODULE=keep.json ./tools/synthea/generate.sh'
    );
  });
});
