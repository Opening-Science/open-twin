/**
 * WHAT: Estimates how long a recipe will take from earlier finished runs on this machine.
 * NOT:  Does not promise a duration; a keep module's cost depends on how rare the chosen conditions are.
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import type { Recipe } from './recipe.ts';
import type { RunRecord } from './runner.ts';

/** Java start-up plus loading ~540 module files, measured before the first person is simulated. */
export const STARTUP_SECONDS = 10;

/**
 * Measured on the machine the studio was written on (one generator thread, as generate.sh runs Synthea):
 * 100 people without conditions took 31 s; 50 people aged 40-75 with hypertension or type 2 diabetes took 45 s.
 */
export const BASELINE = { plainSecondsPerPerson: 0.21, commonConditionSecondsPerPerson: 0.7 } as const;

export type TimingSample = {
  keepModuleSha256: string | null;
  sameShape: string;
  population: number;
  seconds: number;
};

/** Everything except population and seeds, which change the people but hardly the cost per person. */
function shape(recipe: Recipe): string {
  return JSON.stringify([
    recipe.keepModuleSha256,
    recipe.state,
    recipe.city,
    recipe.age,
    recipe.sex,
    recipe.referenceDate,
    recipe.endDate,
    recipe.customModules.map((m) => m.sha256)
  ]);
}

export function timingSamples(runs: RunRecord[]): TimingSample[] {
  return runs
    .filter((r) => r.status === 'finished' && r.elapsedMs !== null)
    .slice(0, 50)
    .map((r) => ({
      keepModuleSha256: r.recipe.keepModuleSha256,
      sameShape: shape(r.recipe),
      population: r.recipe.population,
      seconds: (r.elapsedMs ?? 0) / 1000
    }));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

export type Estimate = { seconds: number | null; basis: string };

export function estimateSeconds(recipe: Recipe, samples: TimingSample[]): Estimate {
  const perPerson = (xs: TimingSample[]): number =>
    median(xs.map((s) => Math.max(0, s.seconds - STARTUP_SECONDS) / s.population));
  const same = samples.filter((s) => s.sameShape === shape(recipe));
  if (same.length > 0) {
    return {
      seconds: Math.round(STARTUP_SECONDS + perPerson(same) * recipe.population),
      basis: `from ${same.length} earlier run(s) of this recipe on this machine`
    };
  }
  const plain = samples.filter((s) => s.keepModuleSha256 === null);
  if (recipe.keepModuleSha256 === null && plain.length > 0) {
    return {
      seconds: Math.round(STARTUP_SECONDS + perPerson(plain) * recipe.population),
      basis: `from ${plain.length} earlier run(s) without conditions on this machine`
    };
  }
  if (recipe.keepModuleSha256 !== null) {
    const guess = Math.round(STARTUP_SECONDS + BASELINE.commonConditionSecondsPerPerson * recipe.population);
    return {
      seconds: null,
      basis: `Hard to predict: Synthea simulates people until enough have the conditions. For common ones (such as hypertension in adults) expect about ${guess} s; rare conditions or "all of" can take many times longer.`
    };
  }
  return {
    seconds: Math.round(STARTUP_SECONDS + BASELINE.plainSecondsPerPerson * recipe.population),
    basis: 'rough guess: about 21 s per 100 people plus 10 s start-up, measured on one machine'
  };
}
