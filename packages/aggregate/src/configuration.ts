/**
 * WHAT: Generates user-owned source preferences from a measurement catalogue and validates saved configuration.
 * NOT:  Does not fetch, persist, select readings, or change aggregate's current reconciliation policy.
 * GOVERNED BY: DECISIONS.md#d19
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Priorities describe user preference, not reliability; omitted supporting sources are excluded, not appended.
 */
import { type MeasurementCatalogue, sharedCatalogueEntries } from './catalogue';

export const RECONCILIATION_CONFIGURATION_VERSION = 1 as const;

export type MissingDataMode = 'strict' | 'fallback';

export interface MeasurementPreference {
  /** Preferred source first. May exclude supporting sources, but must not be empty. */
  sourcePriority: string[];
  missingData: MissingDataMode;
}

export interface ReconciliationConfiguration {
  version: typeof RECONCILIATION_CONFIGURATION_VERSION;
  /** Exactly the keys declared by at least two registered sources. */
  measurements: Record<string, MeasurementPreference>;
}

export interface ConfigurationProblem {
  code:
    | 'invalid-shape'
    | 'unsupported-version'
    | 'unexpected-field'
    | 'unknown-key'
    | 'non-shared-key'
    | 'missing-key'
    | 'invalid-mode'
    | 'empty-priority'
    | 'invalid-source'
    | 'duplicate-source'
    | 'unsupported-source';
  /** JSON Pointer to the invalid field. */
  path: string;
  /** Describes the rule, never the supplied value. */
  message: string;
}

export type ConfigurationValidationResult =
  | { ok: true; configuration: ReconciliationConfiguration }
  | { ok: false; problems: ConfigurationProblem[] };

/** Defaults depend only on declared capabilities and explicit registration order. */
export function generateReconciliationConfiguration(catalogue: MeasurementCatalogue): ReconciliationConfiguration {
  return {
    version: RECONCILIATION_CONFIGURATION_VERSION,
    measurements: Object.fromEntries(
      sharedCatalogueEntries(catalogue).map((entry) => [
        entry.key,
        { sourcePriority: entry.sources.map((source) => source.connector), missingData: 'strict' }
      ])
    )
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function pointerSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

/**
 * Validates configuration against the current catalogue without mutating it or
 * supplying defaults. Runtime checks also guard JSON-loaded data.
 */
export function validateReconciliationConfiguration(
  input: ReconciliationConfiguration,
  catalogue: MeasurementCatalogue
): ConfigurationValidationResult {
  const problems: ConfigurationProblem[] = [];
  const add = (code: ConfigurationProblem['code'], path: string, message: string) => {
    problems.push({ code, path, message });
  };
  const checkFields = (value: Record<string, unknown>, allowed: string[], path: string) => {
    for (const field of Object.keys(value)) {
      if (!allowed.includes(field)) {
        add('unexpected-field', `${path}/${pointerSegment(field)}`, 'Field is not part of this configuration version.');
      }
    }
  };

  if (!isRecord(input)) {
    return { ok: false, problems: [{ code: 'invalid-shape', path: '', message: 'Configuration must be an object.' }] };
  }
  checkFields(input, ['version', 'measurements'], '');
  if (input.version !== RECONCILIATION_CONFIGURATION_VERSION) {
    add('unsupported-version', '/version', 'Configuration version must be 1.');
  }
  if (!isRecord(input.measurements)) {
    add('invalid-shape', '/measurements', 'Measurements must be an object.');
    return { ok: false, problems };
  }

  const entries = new Map(catalogue.entries.map((entry) => [entry.key, entry]));
  const preferences: [string, MeasurementPreference][] = [];
  for (const entry of sharedCatalogueEntries(catalogue)) {
    if (!Object.hasOwn(input.measurements, entry.key)) {
      add(
        'missing-key',
        `/measurements/${pointerSegment(entry.key)}`,
        'Every shared measurement requires a preference.'
      );
    }
  }

  for (const [key, preference] of Object.entries(input.measurements)) {
    const path = `/measurements/${pointerSegment(key)}`;
    const entry = entries.get(key);
    if (!entry) {
      add('unknown-key', path, 'Measurement key is not declared by a registered source.');
      continue;
    }
    if (!entry.shared) {
      add('non-shared-key', path, 'Source preferences apply only to measurements declared by at least two sources.');
      continue;
    }
    if (!isRecord(preference)) {
      add('invalid-shape', path, 'Preference must be an object.');
      continue;
    }
    checkFields(preference, ['sourcePriority', 'missingData'], path);
    const mode = preference.missingData;
    if (mode !== 'strict' && mode !== 'fallback') {
      add('invalid-mode', `${path}/missingData`, 'Missing-data mode must be strict or fallback.');
    }
    if (!Array.isArray(preference.sourcePriority)) {
      add('invalid-shape', `${path}/sourcePriority`, 'Source priority must be an array.');
      continue;
    }
    const priority: unknown[] = preference.sourcePriority;
    if (priority.length === 0) {
      add('empty-priority', `${path}/sourcePriority`, 'Source priority must contain at least one source.');
    }
    const seen = new Set<string>();
    const sources: string[] = [];
    for (const [index, source] of priority.entries()) {
      const sourcePath = `${path}/sourcePriority/${index}`;
      if (typeof source !== 'string' || source.length === 0) {
        add('invalid-source', sourcePath, 'Source must be a nonempty connector id.');
        continue;
      }
      if (seen.has(source)) {
        add('duplicate-source', sourcePath, 'Source must appear only once in the priority list.');
      }
      seen.add(source);
      if (!entry.sources.some((candidate) => candidate.connector === source)) {
        add('unsupported-source', sourcePath, 'Source must declare this measurement key.');
      }
      sources.push(source);
    }
    if (mode === 'strict' || mode === 'fallback') {
      preferences.push([key, { sourcePriority: sources, missingData: mode }]);
    }
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    configuration: { version: RECONCILIATION_CONFIGURATION_VERSION, measurements: Object.fromEntries(preferences) }
  };
}
