/**
 * WHAT: Builds the condition picker catalogue by reading ConditionOnset states from Synthea module JSON.
 * NOT:  Does not invent or look up codes; every code and display comes verbatim from the modules that Synthea runs.
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: The keep module tests "Active Condition", so a condition that Synthea later ends (mayResolve) only keeps
 *         people who still have it when the simulation stops.
 */
import { readZipEntries } from './zip.ts';

export const GROUPS = [
  'cardio-metabolic',
  'respiratory',
  'cancer',
  'neuro',
  'musculoskeletal',
  'kidney',
  'mental health',
  'infection',
  'other'
] as const;
export type Group = (typeof GROUPS)[number];

export type CatalogCondition = {
  code: string;
  display: string;
  group: Group;
  /** Module files (path inside modules/, without .json) that can start this condition. */
  modules: string[];
  /** True when some module can end the condition again. */
  mayResolve: boolean;
};

export type ModuleSource = { path: string; json: unknown };

type Code = { system?: unknown; code?: unknown; display?: unknown };
type State = {
  type?: unknown;
  codes?: unknown;
  assign_to_attribute?: unknown;
  condition_onset?: unknown;
  referenced_by_attribute?: unknown;
};

// Ordered: the first matching rule wins, so "kidney disease due to diabetes" lands in kidney.
const RULES: Array<[Group, RegExp]> = [
  ['cancer', /neoplasm|carcinoma|cancer|leukemia|myeloma/i],
  ['kidney', /kidney|renal|dialysis|proteinuria|microalbuminuria/i],
  [
    'infection',
    /infect|sepsis|septic|bacter|sinusitis|pharyngitis|sore throat|otitis|cystitis|pyelonephritis|hepatitis|coronavirus|pneumonia|immunodeficiency|immune deficiency|mediastinitis/i
  ],
  [
    'mental health',
    /depress|anxiety|stress disorder|suicid|alcohol|drug abuse|opioid abuse|misuses drugs|attention deficit|overdose/i
  ],
  [
    'neuro',
    /epilep|seizure|alzheimer|cerebral palsy|migraine|brain|concussion|spinal cord|hydrocephalus|meningo|chiari|dystonia|intellectual disability|spina bifida/i
  ],
  [
    'respiratory',
    /asthma|obstructive bronchitis|emphysema|bronchitis|rhinitis|sleep apnea|respiratory|hypoxemia|lung|pulmonary|cystic fibrosis/i
  ],
  [
    'cardio-metabolic',
    /hypertension|heart|myocardial|atrial fibrillation|valve|ischemic|coronary|cerebrovascular|thrombosis|diabet|glyc|metabolic|lipid|triglycer|obes|body mass/i
  ],
  [
    'musculoskeletal',
    /arthritis|osteo|fracture|sprain|scoliosis|kyphosis|gout|fibromyalgia|lupus|joint|tendon|ligament|meniscus|back pain|neck pain|whiplash/i
  ]
];

export function classify(display: string): Group {
  for (const [group, re] of RULES) if (re.test(display)) return group;
  return 'other';
}

function snomedCodes(codes: unknown): Array<{ code: string; display: string }> {
  if (!Array.isArray(codes)) return [];
  const out: Array<{ code: string; display: string }> = [];
  for (const c of codes as Code[]) {
    if (c?.system === 'SNOMED-CT' && typeof c.code === 'string' && typeof c.display === 'string') {
      out.push({ code: c.code, display: c.display });
    } else if (c?.system === 'SNOMED-CT' && typeof c.code === 'number' && typeof c.display === 'string') {
      out.push({ code: String(c.code), display: c.display });
    }
  }
  return out;
}

function statesOf(json: unknown): Array<[string, State]> {
  if (typeof json !== 'object' || json === null) return [];
  const states = (json as { states?: unknown }).states;
  if (typeof states !== 'object' || states === null) return [];
  return Object.entries(states as Record<string, State>).filter(
    (e): e is [string, State] => typeof e[1] === 'object' && e[1] !== null
  );
}

/**
 * Collects every SNOMED CT code that a ConditionOnset state can start, de-duplicated by code.
 * The first display seen (modules in path order) is kept.
 */
export function extractConditions(modules: ModuleSource[]): CatalogCondition[] {
  const sorted = [...modules].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Ends can reference a code, an attribute (possibly set in another module) or an onset state in the same module.
  const endedCodes = new Set<string>();
  const endedAttributes = new Set<string>();
  const endedOnsetStates = new Set<string>(); // `${modulePath}#${stateName}`
  for (const m of sorted) {
    for (const [, s] of statesOf(m.json)) {
      if (s.type !== 'ConditionEnd') continue;
      for (const c of snomedCodes(s.codes)) endedCodes.add(c.code);
      if (typeof s.referenced_by_attribute === 'string') endedAttributes.add(s.referenced_by_attribute);
      if (typeof s.condition_onset === 'string') endedOnsetStates.add(`${m.path}#${s.condition_onset}`);
    }
  }

  const byCode = new Map<string, { display: string; modules: Set<string>; mayResolve: boolean }>();
  for (const m of sorted) {
    for (const [name, s] of statesOf(m.json)) {
      if (s.type !== 'ConditionOnset') continue;
      const ended =
        endedOnsetStates.has(`${m.path}#${name}`) ||
        (typeof s.assign_to_attribute === 'string' && endedAttributes.has(s.assign_to_attribute));
      for (const c of snomedCodes(s.codes)) {
        const entry = byCode.get(c.code) ?? { display: c.display, modules: new Set<string>(), mayResolve: false };
        entry.modules.add(m.path);
        entry.mayResolve ||= ended || endedCodes.has(c.code);
        byCode.set(c.code, entry);
      }
    }
  }

  return [...byCode.entries()]
    .map(([code, e]) => ({
      code,
      display: e.display,
      group: classify(e.display),
      modules: [...e.modules].sort(),
      mayResolve: e.mayResolve
    }))
    .sort((a, b) => a.display.localeCompare(b.display, 'en') || a.code.localeCompare(b.code));
}

/** Reads modules/**.json from the Synthea JAR. Paths are relative to modules/ and drop ".json". */
export function readJarModules(jarPath: string): ModuleSource[] {
  const files = readZipEntries(jarPath, (name) => name.startsWith('modules/') && name.endsWith('.json'));
  const out: ModuleSource[] = [];
  for (const [name, content] of files) {
    try {
      out.push({ path: name.slice('modules/'.length, -'.json'.length), json: JSON.parse(content.toString('utf8')) });
    } catch {
      // A module Synthea cannot parse either; it contributes no conditions.
    }
  }
  return out;
}
