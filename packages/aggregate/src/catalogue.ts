/**
 * WHAT: Builds the measurement catalogue from explicitly registered connectors' declarations, grouped by measurement key.
 * NOT:  Fetches nothing, needs no credentials or bundles, holds no source preference and selects nothing; preferences belong to the consuming application.
 * GOVERNED BY: DECISIONS.md#d18
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: The catalogue says what each source can emit, not what any bundle contains. A shared key makes two sources candidates; whether two readings are comparable is still decided per reading.
 */
import {
  ConnectorError,
  MEASUREMENT_DEFINITIONS,
  MEASUREMENT_DEFINITIONS_VERSION,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementDeclaration,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  type MeasurementProblem,
  validateMeasurementDeclarations
} from '@open-twin/fhir-core';
import { AGGREGATOR } from './aggregate';

export interface CatalogueSource {
  connector: string;
  /** Usually one. Several when a connector emits the same measurement in more than one place. */
  declarations: MeasurementDeclaration[];
}

export interface CatalogueEntry {
  key: string;
  definition: MeasurementDefinition;
  /** In connector registration order. */
  sources: CatalogueSource[];
  /** Declared by two or more sources, so a source preference can apply to it. */
  shared: boolean;
}

export interface MeasurementCatalogue {
  schemaVersion: typeof MEASUREMENT_SCHEMA_VERSION;
  definitionsVersion: number;
  /** The registered connectors and their declaration-set versions, in registration order. */
  connectors: { connector: string; version: number }[];
  /** Sorted by key, so the same registrations always produce the same catalogue. */
  entries: CatalogueEntry[];
}

export interface RegistrationProblem extends MeasurementProblem {
  connector: string;
}

function reject(message: string, problems: RegistrationProblem[]): never {
  const listed = problems.map((problem) => `${problem.connector}: ${problem.code} — ${problem.message}`).join('; ');
  throw new ConnectorError(problems.length ? `${message}: ${listed}` : message, {
    code: 'validation',
    connector: AGGREGATOR.connector,
    operation: 'createMeasurementCatalogue'
  });
}

/**
 * The problems that would stop these registrations from forming a catalogue. An empty
 * array means `createMeasurementCatalogue` will succeed.
 */
export function registrationProblems(registrations: readonly MeasurementDeclarationSet[]): RegistrationProblem[] {
  const problems: RegistrationProblem[] = [];
  const seen = new Set<string>();
  for (const set of registrations) {
    if (seen.has(set.connector)) {
      problems.push({
        connector: set.connector,
        code: 'invalid-connector',
        message: 'registered more than once'
      });
      continue;
    }
    seen.add(set.connector);
    for (const problem of validateMeasurementDeclarations(set, MEASUREMENT_DEFINITIONS)) {
      problems.push({ ...problem, connector: set.connector });
    }
  }
  return problems;
}

/**
 * Combines the registered connectors' declarations into one catalogue.
 *
 * Registration order is kept because it is the only order the caller chose; nothing
 * here ranks sources. Each connector's set is validated against the shared
 * definitions first, and any problem rejects the whole registration — a catalogue
 * built around a mis-declared unit would make incompatible values look comparable.
 */
export function createMeasurementCatalogue(registrations: readonly MeasurementDeclarationSet[]): MeasurementCatalogue {
  const problems = registrationProblems(registrations);
  if (problems.length > 0) reject('Cannot build the measurement catalogue', problems);

  const shared = new Map<string, MeasurementDefinition>(
    MEASUREMENT_DEFINITIONS.map((definition) => [definition.key, definition])
  );
  const entries = new Map<string, CatalogueEntry>();

  for (const set of registrations) {
    const own = new Map(set.definitions.map((definition) => [definition.key, definition]));
    for (const declaration of set.declarations) {
      const definition = own.get(declaration.key) ?? shared.get(declaration.key);
      // Unreachable after validation; kept so a future validation gap cannot produce an entry without a definition.
      if (!definition) reject(`Cannot build the measurement catalogue: ${declaration.key} has no definition`, []);

      const entry = entries.get(declaration.key) ?? {
        key: declaration.key,
        definition,
        sources: [],
        shared: false
      };
      const source = entry.sources.find((candidate) => candidate.connector === set.connector);
      if (source) source.declarations.push(declaration);
      else entry.sources.push({ connector: set.connector, declarations: [declaration] });
      entry.shared = entry.sources.length >= 2;
      entries.set(declaration.key, entry);
    }
  }

  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    definitionsVersion: MEASUREMENT_DEFINITIONS_VERSION,
    connectors: registrations.map((set) => ({ connector: set.connector, version: set.version })),
    entries: [...entries.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  };
}

export function catalogueEntry(catalogue: MeasurementCatalogue, key: string): CatalogueEntry | undefined {
  return catalogue.entries.find((entry) => entry.key === key);
}

/** Entries two or more registered sources declare — the keys a source preference can apply to. */
export function sharedCatalogueEntries(catalogue: MeasurementCatalogue): CatalogueEntry[] {
  return catalogue.entries.filter((entry) => entry.shared);
}
