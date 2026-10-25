/**
 * WHAT: Defines the cohort recipe, validates and normalises it, hashes it, and turns it into generate.sh inputs.
 * NOT:  Does not run Synthea (runner.ts) and does not decide which codes exist (conditions.ts reads them from the JAR).
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: The recipe hash covers every input that changes Synthea's output, including the reference date. Leaving
 *         a field out of the hash would let two different cohorts claim the same recipe.
 */
import {
  buildKeepModule,
  type ChosenCondition,
  keepModuleText,
  type Match,
  sha256Hex,
  sortConditions
} from './keep-module.ts';

export const RECIPE_FORMAT = 'open-twin-cohort-recipe/1';

export const LIMITS = {
  populationMin: 1,
  populationMax: 10_000,
  seedMax: 2_147_483_647,
  ageMin: 0,
  ageMax: 140,
  yearMin: 1900,
  yearMax: 2100,
  conditionsMax: 50,
  customModulesMax: 20,
  customModuleBytesMax: 2_000_000
} as const;

/** The 50 states and DC, as named in the Synthea JAR's geography/demographics.csv. */
export const US_STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'District of Columbia',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming'
] as const;

export type Sex = 'any' | 'F' | 'M';

export type SyntheaPinRef = { version: string; jarSha256: string; configSha256: string };

export type CustomModule = { name: string; sha256: string; module: Record<string, unknown> };

export type Recipe = {
  format: typeof RECIPE_FORMAT;
  synthea: SyntheaPinRef;
  population: number;
  seed: number;
  clinicianSeed: number;
  state: string;
  city: string | null;
  age: { min: number; max: number } | null;
  sex: Sex;
  referenceDate: string;
  endDate: string;
  conditions: { match: Match; chosen: ChosenCondition[] };
  keepModuleSha256: string | null;
  customModules: CustomModule[];
  recipeSha256: string;
};

export const DEFAULT_DATE = '2026-01-01';

export function defaultRecipeInput(): Record<string, unknown> {
  return {
    population: 20,
    seed: 42,
    clinicianSeed: 43,
    state: 'Massachusetts',
    city: null,
    age: null,
    sex: 'any',
    referenceDate: DEFAULT_DATE,
    endDate: DEFAULT_DATE,
    conditions: { match: 'any', chosen: [] },
    customModules: []
  };
}

export type Checked = { recipe: Recipe | null; errors: string[]; warnings: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function toInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

export function isCalendarDate(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const PLACE_RE = /^[A-Za-z][A-Za-z .'-]{0,59}$/;
const MODULE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,95}\.json$/;

/** The bytes written for a custom module; its sha256 is what the recipe records. */
export function customModuleText(module: Record<string, unknown>): string {
  return `${JSON.stringify(module, null, 2)}\n`;
}

/** Checks a Module Builder export: a JSON object whose `states` holds an Initial state. */
export function checkModuleJson(json: unknown): string | null {
  if (!isObject(json)) return 'is not a JSON object';
  const states = json.states;
  if (!isObject(states) || Object.keys(states).length === 0) return 'has no "states"';
  const initial = states.Initial;
  if (!isObject(initial) || initial.type !== 'Initial') return 'has no "Initial" state';
  return null;
}

/** Everything except the hash itself and the module bodies, which their sha256 values already cover. */
export function hashInput(recipe: Omit<Recipe, 'recipeSha256'>): string {
  return JSON.stringify({
    ...recipe,
    customModules: recipe.customModules.map((m) => ({ name: m.name, sha256: m.sha256 }))
  });
}

/**
 * Validates loose input (form state or a loaded recipe file) into a normalised recipe.
 * `pin` is the Synthea version this checkout runs; a recipe pinned to another version gets a warning.
 */
export function checkRecipe(input: unknown, pin: SyntheaPinRef): Checked {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObject(input)) return { recipe: null, errors: ['The recipe must be a JSON object.'], warnings };

  if (input.format !== undefined && input.format !== RECIPE_FORMAT) {
    errors.push(`Unknown recipe format "${String(input.format)}"; expected "${RECIPE_FORMAT}".`);
  }
  if (isObject(input.synthea)) {
    const s = input.synthea;
    if (s.version !== pin.version || s.jarSha256 !== pin.jarSha256) {
      warnings.push(
        `This recipe was written for Synthea ${String(s.version)}; this checkout runs ${pin.version}. The people will differ.`
      );
    } else if (s.configSha256 !== undefined && s.configSha256 !== pin.configSha256) {
      warnings.push(
        'This recipe was written with different Synthea settings (synthea.properties). The people will differ.'
      );
    }
  }

  const population = toInt(input.population);
  if (population === null || population < LIMITS.populationMin || population > LIMITS.populationMax) {
    errors.push(`Population must be a whole number from ${LIMITS.populationMin} to ${LIMITS.populationMax}.`);
  }
  const seed = toInt(input.seed);
  if (seed === null || seed < 0 || seed > LIMITS.seedMax)
    errors.push(`Seed must be a whole number from 0 to ${LIMITS.seedMax}.`);
  const clinicianSeed = toInt(input.clinicianSeed);
  if (clinicianSeed === null || clinicianSeed < 0 || clinicianSeed > LIMITS.seedMax) {
    errors.push(`Clinician seed must be a whole number from 0 to ${LIMITS.seedMax}.`);
  }

  const state = typeof input.state === 'string' ? input.state.trim() : '';
  if (!(US_STATES as readonly string[]).includes(state))
    errors.push('Choose a US state (or the District of Columbia).');
  let city: string | null = null;
  if (typeof input.city === 'string' && input.city.trim() !== '') {
    city = input.city.trim();
    if (!PLACE_RE.test(city)) {
      errors.push('City may only contain letters, spaces, dots, apostrophes and hyphens.');
      city = null;
    }
  }

  let age: Recipe['age'] = null;
  if (input.age !== null && input.age !== undefined) {
    const a = isObject(input.age) ? input.age : {};
    const min = toInt(a.min);
    const max = toInt(a.max);
    if (min === null || max === null) {
      errors.push('Give both the youngest and the oldest age, or leave both empty for all ages.');
    } else if (min < LIMITS.ageMin || max > LIMITS.ageMax) {
      errors.push(`Ages must be between ${LIMITS.ageMin} and ${LIMITS.ageMax}.`);
    } else if (min > max) {
      errors.push('The youngest age must not be above the oldest age.');
    } else {
      age = { min, max };
    }
  }

  const sex = input.sex === undefined ? 'any' : input.sex;
  if (sex !== 'any' && sex !== 'F' && sex !== 'M') errors.push('Sex must be any, F or M.');

  const dates: Record<'referenceDate' | 'endDate', string> = { referenceDate: '', endDate: '' };
  for (const key of ['referenceDate', 'endDate'] as const) {
    const v = input[key];
    const label = key === 'referenceDate' ? 'Reference date' : 'End date';
    if (typeof v !== 'string' || !isCalendarDate(v)) {
      errors.push(`${label} must be a real date written YYYY-MM-DD.`);
      continue;
    }
    const year = Number(v.slice(0, 4));
    if (year < LIMITS.yearMin || year > LIMITS.yearMax) {
      errors.push(`${label} must be between ${LIMITS.yearMin} and ${LIMITS.yearMax}.`);
      continue;
    }
    dates[key] = v;
  }
  if (dates.referenceDate && dates.endDate && dates.endDate < dates.referenceDate) {
    errors.push('End date must not be before the reference date.');
  }

  const cond = isObject(input.conditions) ? input.conditions : {};
  const match: Match = cond.match === 'all' ? 'all' : 'any';
  if (cond.match !== undefined && cond.match !== 'any' && cond.match !== 'all') {
    errors.push('Condition matching must be "any" or "all".');
  }
  const chosen: ChosenCondition[] = [];
  for (const c of Array.isArray(cond.chosen) ? cond.chosen : []) {
    if (isObject(c) && typeof c.code === 'string' && /^\d{6,18}$/.test(c.code) && typeof c.display === 'string') {
      chosen.push({ code: c.code, display: c.display });
    } else {
      errors.push('Every chosen condition needs a SNOMED CT code (digits) and a display name.');
      break;
    }
  }
  if (chosen.length > LIMITS.conditionsMax) errors.push(`Choose at most ${LIMITS.conditionsMax} conditions.`);
  const keep = buildKeepModule(chosen, match);
  const keepModuleSha256 = keep ? sha256Hex(keepModuleText(keep)) : null;
  if (isObject(input) && typeof input.keepModuleSha256 === 'string' && input.keepModuleSha256 !== keepModuleSha256) {
    warnings.push('The keep-module hash in the file does not match its conditions; it was recalculated.');
  }

  const customModules: CustomModule[] = [];
  const names = new Set<string>();
  const rawModules = Array.isArray(input.customModules) ? input.customModules : [];
  if (rawModules.length > LIMITS.customModulesMax) errors.push(`At most ${LIMITS.customModulesMax} custom modules.`);
  for (const m of rawModules.slice(0, LIMITS.customModulesMax)) {
    const name = isObject(m) && typeof m.name === 'string' ? m.name : '';
    if (!MODULE_NAME_RE.test(name)) {
      errors.push(`Custom module "${name}" needs a plain file name ending in .json.`);
      continue;
    }
    if (names.has(name.toLowerCase())) {
      errors.push(`Two custom modules are called "${name}".`);
      continue;
    }
    names.add(name.toLowerCase());
    const module = isObject(m) ? m.module : undefined;
    const problem = checkModuleJson(module);
    if (problem || !isObject(module)) {
      errors.push(`Custom module "${name}" ${problem ?? 'is not a module'}.`);
      continue;
    }
    const text = customModuleText(module);
    if (Buffer.byteLength(text) > LIMITS.customModuleBytesMax) {
      errors.push(`Custom module "${name}" is larger than ${LIMITS.customModuleBytesMax / 1_000_000} MB.`);
      continue;
    }
    const sha256 = sha256Hex(text);
    if (isObject(m) && typeof m.sha256 === 'string' && m.sha256 !== sha256) {
      errors.push(`Custom module "${name}" does not match the sha256 recorded in the recipe.`);
      continue;
    }
    customModules.push({ name, sha256, module });
  }
  customModules.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  if (errors.length > 0 || population === null || seed === null || clinicianSeed === null) {
    return { recipe: null, errors, warnings };
  }

  const body: Omit<Recipe, 'recipeSha256'> = {
    format: RECIPE_FORMAT,
    synthea: { version: pin.version, jarSha256: pin.jarSha256, configSha256: pin.configSha256 },
    population,
    seed,
    clinicianSeed,
    state,
    city,
    age,
    sex: sex as Sex,
    referenceDate: dates.referenceDate,
    endDate: dates.endDate,
    conditions: { match, chosen: sortConditions(chosen) },
    keepModuleSha256,
    customModules
  };
  const recipeSha256 = sha256Hex(hashInput(body));
  if (typeof input.recipeSha256 === 'string' && input.recipeSha256 !== recipeSha256 && warnings.length === 0) {
    warnings.push('The recipe hash in the file does not match its contents; it was recalculated.');
  }
  return { recipe: { ...body, recipeSha256 }, errors, warnings };
}

const compact = (date: string): string => date.replaceAll('-', '');

/** The generate.sh environment for this recipe. Paths are filled in by the runner. */
export function recipeEnv(
  recipe: Recipe,
  paths: { outDir: string; keepModule: string | null; modulesDir: string | null }
): Record<string, string> {
  const env: Record<string, string> = {
    SYNTHEA_POPULATION: String(recipe.population),
    SYNTHEA_SEED: String(recipe.seed),
    SYNTHEA_CLINICIAN_SEED: String(recipe.clinicianSeed),
    SYNTHEA_STATE: recipe.state,
    SYNTHEA_REFERENCE_DATE: compact(recipe.referenceDate),
    SYNTHEA_END_DATE: compact(recipe.endDate),
    SYNTHEA_OUT_DIR: paths.outDir
  };
  if (recipe.city) env.SYNTHEA_CITY = recipe.city;
  if (recipe.age) env.SYNTHEA_AGE = `${recipe.age.min}-${recipe.age.max}`;
  if (recipe.sex !== 'any') env.SYNTHEA_GENDER = recipe.sex;
  if (paths.keepModule) env.SYNTHEA_KEEP_MODULE = paths.keepModule;
  if (paths.modulesDir) env.SYNTHEA_MODULES_DIR = paths.modulesDir;
  return env;
}

const shellQuote = (s: string): string => (/^[A-Za-z0-9_./:=-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`);

/** The command that reruns a downloaded recipe file from the repository root. */
export function cohortCommand(recipeFile: string): string {
  return `pnpm cohort ${shellQuote(recipeFile)}`;
}

/** What the runner calls, written out for someone who wants to use generate.sh directly. */
export function generateCommand(recipe: Recipe): string {
  const env = recipeEnv(recipe, {
    outDir: 'my-cohort',
    keepModule: recipe.keepModuleSha256 ? 'keep.json' : null,
    modulesDir: recipe.customModules.length > 0 ? 'modules' : null
  });
  const parts = Object.entries(env).map(([k, v]) => `${k}=${shellQuote(v)}`);
  return `${parts.join(' ')} ./tools/synthea/generate.sh`;
}

export function recipeFileName(recipe: Recipe): string {
  return `cohort-recipe-${recipe.recipeSha256.slice(0, 12)}.json`;
}

export function keepModuleFor(recipe: Recipe): string | null {
  const keep = buildKeepModule(recipe.conditions.chosen, recipe.conditions.match);
  return keep ? keepModuleText(keep) : null;
}
