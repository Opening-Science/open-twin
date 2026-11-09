/**
 * WHAT: The connector registry: the zod schema for registry/connectors.json, loadRegistry, descriptorOf, resolveReader, and the JSON Schema and markdown table generated from it.
 * NOT:  Does not choose a reader for an input; the delegator does. Does not know where packages resolve from; resolveReader takes the caller's importer.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: the zod schema is the source; registry/connectors.schema.json is generated from it and verify/check-registry.ts fails when the two drift. Edit the schema here, then regenerate.
 */
import { readFileSync } from 'node:fs';
import { ConnectorError } from '@open-twin/fhir-core';
import { z } from 'zod';
import type { IHealthDataReader } from './reader';
import { AUTH_KINDS, DATA_DOMAINS, READER_KINDS, type ReaderDescriptor } from './types';
import { failedFieldPaths } from './utils/parser';

const ID = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export const RegistryEntrySchema = z
  .object({
    id: z.string().regex(ID).describe('Registry id, kebab-case. Equals the connector code in Bundle.meta.tag.'),
    package: z
      .string()
      .regex(/^@open-twin\/[a-z0-9-]+$/)
      .describe('The workspace package that implements the reader.'),
    export: z
      .string()
      .regex(/^[A-Z][A-Za-z0-9]*Reader$/)
      .optional()
      .describe('The reader class the package exports. Absent while the adapter is still to be written.'),
    name: z.string().min(1),
    version: z.string().regex(SEMVER).describe('Equals the package.json version; verify/check-registry.ts checks it.'),
    kind: z.enum(READER_KINDS),
    auth: z.enum(AUTH_KINDS),
    domains: z.array(z.enum(DATA_DOMAINS)).min(1),
    dataTypes: z.array(z.string().min(1)).min(1).describe('The request types the reader supports.'),
    suffixes: z.array(z.string().regex(/^\.[a-z0-9.]+$/)).optional(),
    mediaTypes: z.array(z.string().min(1)).optional(),
    aliases: z.array(z.string().regex(ID)).optional().describe('Naming history only, never a second id.'),
    status: z.enum(['must-have', 'nice-to-have', 'research', 'deprecated']),
    priority: z.int().min(0).max(1000).describe('Higher is asked first by the delegator; generic readers sit last.'),
    maintainer: z.string().regex(/^github:[A-Za-z0-9-]+$/),
    docs: z.string().min(1).describe('Repository path of the package README.'),
    vendorDocs: z.url().optional(),
    fixtures: z.string().min(1).optional().describe('Repository path of the fixture directory.'),
    fixturesProvenance: z.string().min(1).optional(),
    verificationBundles: z.array(z.string().min(1)).min(1).describe('Names in verify/bundles.manifest.ts.')
  })
  .strict();

export const RegistrySchema = z
  .object({ $schema: z.string().optional(), connectors: z.array(RegistryEntrySchema).min(1) })
  .strict();

export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

export interface Registry {
  path: string;
  /** Highest priority first, then by id. */
  entries: RegistryEntry[];
}

/** JSON Schema 2020-12 for registry/connectors.json, from the zod schema above. */
export function registryJsonSchema(): Record<string, unknown> {
  return {
    $id: 'https://github.com/Opening-Science/open-twin/registry/connectors.schema.json',
    title: 'open-twin connector registry',
    ...z.toJSONSchema(RegistrySchema, { target: 'draft-2020-12' })
  };
}

function registryError(message: string, operation: string): ConnectorError {
  return new ConnectorError(message, { code: 'validation', connector: 'registry', operation });
}

/** Rules that span entries: unique ids and packages, no alias that is also an id. */
function crossEntryViolations(entries: readonly RegistryEntry[]): string[] {
  const violations: string[] = [];
  const ids = new Set(entries.map((e) => e.id));
  const seenId = new Set<string>();
  const seenPackage = new Set<string>();
  for (const entry of entries) {
    if (seenId.has(entry.id)) violations.push(`duplicate id "${entry.id}"`);
    seenId.add(entry.id);
    if (seenPackage.has(entry.package)) violations.push(`package "${entry.package}" has more than one entry`);
    seenPackage.add(entry.package);
    for (const alias of entry.aliases ?? []) {
      if (ids.has(alias)) violations.push(`alias "${alias}" of "${entry.id}" is also an id`);
    }
  }
  return violations;
}

/** Reads and validates the registry. Throws `validation` naming the offending field, never quoting the file. */
export function loadRegistry(path: string): Registry {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw registryError('The registry file could not be read or is not JSON', 'loadRegistry');
  }
  const parsed = RegistrySchema.safeParse(json);
  if (!parsed.success) {
    throw registryError(`The registry does not match its schema at: ${failedFieldPaths(parsed.error)}`, 'loadRegistry');
  }
  const violations = crossEntryViolations(parsed.data.connectors);
  if (violations.length > 0)
    throw registryError(`The registry breaks its rules: ${violations.join('; ')}`, 'loadRegistry');
  const entries = [...parsed.data.connectors].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  return { path, entries };
}

/** The descriptor a reader must expose for this entry (conformance rule 1). */
export function descriptorOf(entry: RegistryEntry): ReaderDescriptor {
  const descriptor: ReaderDescriptor = {
    id: entry.id,
    name: entry.name,
    version: entry.version,
    kind: entry.kind,
    domains: [...entry.domains],
    dataTypes: [...entry.dataTypes],
    auth: entry.auth
  };
  if (entry.suffixes) descriptor.suffixes = [...entry.suffixes];
  if (entry.mediaTypes) descriptor.mediaTypes = [...entry.mediaTypes];
  if (entry.vendorDocs) descriptor.vendorDocs = entry.vendorDocs;
  return descriptor;
}

/**
 * Imports `entry.package` through the caller's importer and instantiates `entry.export`.
 * The importer is the caller's because only the caller knows where packages resolve from.
 */
export async function resolveReader(
  entry: RegistryEntry,
  importer: (specifier: string) => Promise<unknown>
): Promise<IHealthDataReader> {
  if (!entry.export) {
    throw new ConnectorError(`No reader adapter is registered for "${entry.id}" yet`, {
      code: 'unsupported',
      connector: entry.id,
      operation: 'resolveReader'
    });
  }
  const module = (await importer(entry.package)) as Record<string, unknown>;
  const ctor = module[entry.export];
  if (typeof ctor !== 'function')
    throw registryError(`"${entry.package}" does not export "${entry.export}"`, 'resolveReader');
  return new (ctor as new () => IHealthDataReader)();
}

const TABLE_START = '<!-- registry:start -->';
const TABLE_END = '<!-- registry:end -->';

/** The connector table as markdown, highest priority first. `linkPrefix` is the path from the document to the repository root. */
export function renderRegistryTable(entries: readonly RegistryEntry[], linkPrefix = ''): string {
  const header = ['id', 'package', 'source', 'kind', 'auth', 'domains', 'status', 'priority', 'reader'];
  const rows = entries.map((entry) => [
    entry.aliases?.length
      ? `\`${entry.id}\` (alias ${entry.aliases.map((a) => `\`${a}\``).join(', ')})`
      : `\`${entry.id}\``,
    `[\`${entry.package}\`](${linkPrefix}${entry.docs.replace(/\/README\.md$/, '')})`,
    entry.name,
    entry.kind,
    entry.auth,
    entry.domains.join(', '),
    entry.status,
    String(entry.priority),
    entry.export ? `\`${entry.export}\`` : 'pending'
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join(' | ')} |`;
  return [line(header), `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`, ...rows.map(line)].join('\n');
}

/** Replaces the text between the registry markers, which must occur exactly once each. */
export function replaceBetweenMarkers(document: string, table: string, generatedBy: string): string {
  const start = document.indexOf(TABLE_START);
  const end = document.indexOf(TABLE_END);
  const once = (marker: string) => document.indexOf(marker) === document.lastIndexOf(marker);
  if (start === -1 || end < start || !once(TABLE_START) || !once(TABLE_END)) {
    throw registryError(
      'The document needs exactly one registry:start and one registry:end marker, in that order',
      'replaceBetweenMarkers'
    );
  }
  const block = `${TABLE_START}\n<!-- Generated by ${generatedBy} from registry/connectors.json. Do not edit by hand. -->\n\n${table}\n\n`;
  return document.slice(0, start) + block + document.slice(end);
}
