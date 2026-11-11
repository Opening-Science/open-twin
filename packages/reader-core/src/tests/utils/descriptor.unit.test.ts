import { describe, expect, it } from 'vitest';
import type { IHealthDataReader } from '../../reader';
import type { ReaderDescriptor } from '../../types';
import { checkDescriptor } from '../../utils/descriptor';

const entry: ReaderDescriptor = {
  id: 'probe',
  version: '0.1.0',
  name: 'Probe',
  kind: 'api',
  auth: 'none',
  domains: ['wearable', 'body-scan'],
  dataTypes: ['steps', 'sleep']
};

const readerWith = (descriptor: ReaderDescriptor) => ({ descriptor }) as IHealthDataReader;

describe('checkDescriptor', () => {
  it('accepts list fields in any order', () => {
    const reordered: ReaderDescriptor = { ...entry, domains: ['body-scan', 'wearable'], dataTypes: ['sleep', 'steps'] };

    expect(checkDescriptor(readerWith(reordered), entry)).toEqual([]);
  });

  it('names each field that differs, including one the entry lacks', () => {
    const drifted = { ...entry, version: '0.2.0', dataTypes: ['steps'], extra: 'x' } as ReaderDescriptor;

    expect(checkDescriptor(readerWith(drifted), entry)).toEqual([
      'rule 1: descriptor.version differs from the registry entry',
      'rule 1: descriptor.dataTypes differs from the registry entry',
      'rule 1: descriptor.extra differs from the registry entry'
    ]);
  });
});
