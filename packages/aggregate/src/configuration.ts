/**
 * WHAT: Generates, validates and explicitly proposes updates to user-owned source preferences against measurement catalogues.
 * NOT:  Does not fetch, persist, select readings, or change aggregate's current reconciliation policy.
 * GOVERNED BY: DECISIONS.md#d19
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Priorities describe user preference, not reliability; omitted supporting sources are excluded, not appended.
 */
import type { MeasurementDeclaration, MeasurementDefinition } from '@open-twin/fhir-core';
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

export interface CatalogueChange {
  code:
    | 'schema-changed'
    | 'measurement-added'
    | 'measurement-removed'
    | 'became-shared'
    | 'no-longer-shared'
    | 'source-added'
    | 'source-removed'
    | 'definition-changed'
    | 'declarations-changed';
  /** Absent only for a catalogue schema change. */
  key?: string;
  connector?: string;
  /** The proposal must not be used until the caller explicitly resolves or accepts this change. */
  requiresResolution: boolean;
}

export interface ConfigurationUpdateResult {
  /** True only when the proposal is valid against the next catalogue and has no conflicts. */
  ok: boolean;
  /** Null when the saved configuration is invalid against the previous catalogue. */
  proposedConfiguration: ReconciliationConfiguration | null;
  changes: CatalogueChange[];
  conflicts: CatalogueChange[];
  /** Baseline validation errors, or validation errors remaining in a blocked proposal. */
  problems: ConfigurationProblem[];
}

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

function definitionSignature(definition: MeasurementDefinition): string {
  return JSON.stringify([
    definition.description,
    definition.valueType,
    definition.canonicalUnit,
    definition.context.scope,
    definition.context.statistic
  ]);
}

function declarationSignatures(declarations: MeasurementDeclaration[]): string {
  return JSON.stringify(
    declarations
      .map((declaration) =>
        JSON.stringify([
          declaration.coding.system,
          declaration.coding.code,
          declaration.location.kind,
          declaration.location.kind === 'component' ? declaration.location.parent.system : null,
          declaration.location.kind === 'component' ? declaration.location.parent.code : null,
          declaration.valueType,
          declaration.unit,
          declaration.context.scope,
          declaration.context.statistic
        ])
      )
      .sort()
  );
}

function sourceRemovalChange(
  key: string,
  connector: string,
  preference: MeasurementPreference | undefined
): CatalogueChange {
  return {
    code: 'source-removed',
    key,
    connector,
    requiresResolution: preference?.sourcePriority.includes(connector) ?? false
  };
}

/**
 * Explicit, offline update preview. Both catalogues must be complete snapshots
 * produced by createMeasurementCatalogue (or their JSON round trips).
 * Unsafe preferences are retained for caller resolution, never silently pruned.
 */
export function updateReconciliationConfiguration(
  input: ReconciliationConfiguration,
  previousCatalogue: MeasurementCatalogue,
  nextCatalogue: MeasurementCatalogue
): ConfigurationUpdateResult {
  const baseline = validateReconciliationConfiguration(input, previousCatalogue);
  if (!baseline.ok) {
    return { ok: false, proposedConfiguration: null, changes: [], conflicts: [], problems: baseline.problems };
  }

  const proposedConfiguration = baseline.configuration;
  const changes: CatalogueChange[] = [];
  if (previousCatalogue.schemaVersion !== nextCatalogue.schemaVersion) {
    changes.push({ code: 'schema-changed', requiresResolution: true });
    return { ok: false, proposedConfiguration, changes, conflicts: [...changes], problems: [] };
  }

  const previousEntries = new Map(previousCatalogue.entries.map((entry) => [entry.key, entry]));
  const nextEntries = new Map(nextCatalogue.entries.map((entry) => [entry.key, entry]));
  const defaults = generateReconciliationConfiguration(nextCatalogue);
  const preferences = new Map(Object.entries(proposedConfiguration.measurements));

  for (const previous of previousCatalogue.entries) {
    if (!nextEntries.has(previous.key)) {
      changes.push({ code: 'measurement-removed', key: previous.key, requiresResolution: previous.shared });
      for (const source of previous.sources) {
        changes.push(sourceRemovalChange(previous.key, source.connector, preferences.get(previous.key)));
      }
    }
  }

  for (const next of nextCatalogue.entries) {
    const previous = previousEntries.get(next.key);
    if (!previous) {
      changes.push({ code: 'measurement-added', key: next.key, requiresResolution: false });
    } else {
      if (!previous.shared && next.shared) {
        changes.push({ code: 'became-shared', key: next.key, requiresResolution: false });
      } else if (previous.shared && !next.shared) {
        changes.push({ code: 'no-longer-shared', key: next.key, requiresResolution: true });
      }
      if (definitionSignature(previous.definition) !== definitionSignature(next.definition)) {
        changes.push({ code: 'definition-changed', key: next.key, requiresResolution: true });
      }
    }

    const preference = preferences.get(next.key);
    const oldSources = new Map(previous?.sources.map((source) => [source.connector, source]));
    const newSources = new Set(next.sources.map((source) => source.connector));
    for (const source of previous?.sources ?? []) {
      if (!newSources.has(source.connector)) {
        changes.push(sourceRemovalChange(next.key, source.connector, preference));
      }
    }
    for (const source of next.sources) {
      const oldSource = oldSources.get(source.connector);
      if (!oldSource) {
        changes.push({
          code: 'source-added',
          key: next.key,
          connector: source.connector,
          requiresResolution: false
        });
        if (preference && next.shared) preference.sourcePriority.push(source.connector);
      } else if (declarationSignatures(oldSource.declarations) !== declarationSignatures(source.declarations)) {
        changes.push({
          code: 'declarations-changed',
          key: next.key,
          connector: source.connector,
          requiresResolution: true
        });
      }
    }
    if (next.shared && !preference) {
      const generated = defaults.measurements[next.key];
      if (generated) preferences.set(next.key, generated);
    }
  }

  proposedConfiguration.measurements = Object.fromEntries(preferences);
  const validation = validateReconciliationConfiguration(proposedConfiguration, nextCatalogue);
  const conflicts = changes.filter((change) => change.requiresResolution);
  return {
    ok: conflicts.length === 0 && validation.ok,
    proposedConfiguration,
    changes,
    conflicts,
    problems: validation.ok ? [] : validation.problems
  };
}
