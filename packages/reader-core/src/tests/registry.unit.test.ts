import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectorError } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import {
  checkRegistryRules,
  descriptorOf,
  loadRegistry,
  type RegistryEntry,
  registryJsonSchema,
  renderRegistryTable,
  replaceBetweenMarkers,
  resolveReader
} from '../registry';
import { FakeStepsReader } from './fake-reader';

const REPO_REGISTRY = join(import.meta.dirname, '..', '..', '..', '..', 'registry', 'connectors.json');

const entry: RegistryEntry = {
  id: 'fake-steps',
  package: '@open-twin/fake-steps',
  export: 'FakeStepsReader',
  name: 'Fake step counter (tests only)',
  version: '0.1.0',
  kind: 'file',
  auth: 'none',
  domains: ['synthetic'],
  dataTypes: ['daily-steps'],
  suffixes: ['.steps.json'],
  mediaTypes: ['application/json'],
  status: 'research',
  priority: 5,
  maintainer: 'github:nobody',
  docs: 'packages/fake/README.md',
  verificationBundles: ['fake-steps']
};

function writeRegistry(connectors: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'registry-'));
  const path = join(dir, 'connectors.json');
  writeFileSync(path, JSON.stringify({ connectors }));
  return path;
}

describe('loadRegistry', () => {
  it('loads the repository registry sorted by priority, highest first', () => {
    const registry = loadRegistry(REPO_REGISTRY);
    const priorities = registry.entries.map((e) => e.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
    expect(registry.entries[0]?.id).toBe('oura');
    expect(registry.entries.at(-1)?.id).toBe('fhir-r4');
    expect(registry.entries.find((e) => e.id === 'google-health')?.aliases).toEqual(['fitbit']);
  });

  it('rejects an entry that breaks the schema, naming the field and not the file', () => {
    const path = writeRegistry([{ ...entry, status: 'planned', secret: 'hunter2' }]);
    const error = (() => {
      try {
        loadRegistry(path);
      } catch (e) {
        return e;
      }
    })() as ConnectorError;
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error.code).toBe('validation');
    expect(error.message).toContain('connectors.0.status');
    expect(error.message).not.toContain('hunter2');
  });

  it('rejects a file that is not JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'registry-'));
    const path = join(dir, 'connectors.json');
    writeFileSync(path, '{');
    expect(() => loadRegistry(path)).toThrow(ConnectorError);
  });

  it('rejects duplicate ids, duplicate packages and an alias that is also an id', () => {
    expect(checkRegistryRules([entry, { ...entry, package: '@open-twin/other' }])).toEqual([
      'duplicate id "fake-steps"'
    ]);
    expect(checkRegistryRules([entry, { ...entry, id: 'other' }])).toEqual([
      'package "@open-twin/fake-steps" has more than one entry'
    ]);
    expect(
      checkRegistryRules([entry, { ...entry, id: 'other', package: '@open-twin/other', aliases: ['fake-steps'] }])
    ).toEqual(['alias "fake-steps" of "other" is also an id']);
    expect(() => loadRegistry(writeRegistry([entry, entry]))).toThrow(/duplicate id/);
  });
});

describe('descriptorOf and resolveReader', () => {
  it('gives the descriptor a conforming reader must expose', () => {
    expect(descriptorOf(entry)).toEqual(new FakeStepsReader().descriptor);
  });

  it('instantiates the export through the importer', async () => {
    const reader = await resolveReader(entry, async () => ({ FakeStepsReader }));
    expect(reader.descriptor.id).toBe('fake-steps');
  });

  it('is unsupported without an export and validation when the export is missing', async () => {
    const { export: _omitted, ...pending } = entry;
    await expect(resolveReader(pending, async () => ({}))).rejects.toMatchObject({ code: 'unsupported' });
    await expect(resolveReader(entry, async () => ({}))).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('generated artefacts', () => {
  it('produces a JSON Schema 2020-12 that rejects an unknown field', () => {
    const schema = registryJsonSchema();
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    const connectors = (schema.properties as Record<string, { items: { additionalProperties?: boolean } }>).connectors;
    expect(connectors?.items.additionalProperties).toBe(false);
  });

  it('renders a table with a pending reader and replaces it between markers', () => {
    const { export: _omitted, ...pending } = entry;
    const table = renderRegistryTable([pending], '../');
    expect(table).toContain('| `fake-steps`');
    expect(table).toContain('(../packages/fake)');
    expect(table).toContain('pending');
    const doc = 'before\n<!-- registry:start -->\nold\n<!-- registry:end -->\nafter\n';
    const next = replaceBetweenMarkers(doc, table, 'tests');
    expect(next).toContain(table);
    expect(next).not.toContain('old');
    expect(next.startsWith('before\n')).toBe(true);
    expect(next.endsWith('<!-- registry:end -->\nafter\n')).toBe(true);
    expect(() => replaceBetweenMarkers('no markers', table, 'tests')).toThrow(ConnectorError);
  });
});
