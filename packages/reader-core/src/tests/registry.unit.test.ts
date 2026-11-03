import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectorError } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import {
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

function registryFile(content: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'registry-')), 'connectors.json');
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify({ connectors: content }));
  return path;
}

const loadError = (path: string): ConnectorError => {
  try {
    loadRegistry(path);
  } catch (e) {
    return e as ConnectorError;
  }
  throw new Error('expected loadRegistry to throw');
};

describe('loadRegistry', () => {
  it('loads the repository registry, highest priority first', () => {
    const { entries } = loadRegistry(REPO_REGISTRY);
    const priorities = entries.map((e) => e.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });

  it('rejects a schema violation naming the field, never the value, and a file that is not JSON', () => {
    const error = loadError(registryFile([{ ...entry, status: 'planned', secret: 'hunter2' }]));
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error.code).toBe('validation');
    expect(error.message).toContain('connectors.0.status');
    expect(error.message).not.toContain('hunter2');
    expect(loadError(registryFile('{')).code).toBe('validation');
  });

  it('rejects duplicate ids, duplicate packages and an alias that is also an id', () => {
    expect(loadError(registryFile([entry, { ...entry, package: '@open-twin/other' }])).message).toMatch(/duplicate id/);
    expect(loadError(registryFile([entry, { ...entry, id: 'other' }])).message).toMatch(/more than one entry/);
    expect(
      loadError(registryFile([entry, { ...entry, id: 'other', package: '@open-twin/other', aliases: ['fake-steps'] }]))
        .message
    ).toMatch(/also an id/);
  });
});

describe('descriptorOf and resolveReader', () => {
  it('gives the descriptor a conforming reader must expose', () => {
    expect(descriptorOf(entry)).toEqual(new FakeStepsReader().descriptor);
  });

  it('instantiates the export through the importer; unsupported without one, validation when missing', async () => {
    const reader = await resolveReader(entry, () => Promise.resolve({ FakeStepsReader }));
    expect(reader.descriptor.id).toBe('fake-steps');
    const { export: _omitted, ...pending } = entry;
    await expect(resolveReader(pending, () => Promise.resolve({}))).rejects.toMatchObject({ code: 'unsupported' });
    await expect(resolveReader(entry, () => Promise.resolve({}))).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('generated artefacts', () => {
  it('produces a JSON Schema 2020-12 that rejects an unknown field', () => {
    const schema = registryJsonSchema();
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    const connectors = (schema.properties as Record<string, { items: { additionalProperties?: boolean } }>).connectors;
    expect(connectors?.items.additionalProperties).toBe(false);
  });

  it('renders a pending reader and replaces the table between exactly one pair of markers', () => {
    const { export: _omitted, ...pending } = entry;
    const table = renderRegistryTable([pending], '../');
    expect(table).toContain('| `fake-steps`');
    expect(table).toContain('(../packages/fake)');
    expect(table).toContain('pending');
    const doc = 'before\n<!-- registry:start -->\nold\n<!-- registry:end -->\nafter\n';
    const next = replaceBetweenMarkers(doc, table, 'tests');
    expect(next).toContain(table);
    expect(next).not.toContain('old');
    expect(next.startsWith('before\n') && next.endsWith('<!-- registry:end -->\nafter\n')).toBe(true);
    expect(() => replaceBetweenMarkers('no markers', table, 'tests')).toThrow(ConnectorError);
    expect(() => replaceBetweenMarkers(`${doc}<!-- registry:end -->`, table, 'tests')).toThrow(ConnectorError);
  });
});
