/**
 * WHAT: checkDescriptor: rule 1, the reader's descriptor equals its registry entry, list fields compared in any order.
 * NOT:  Not a vitest assertion: verify/check-registry.ts runs it outside a test runner, so it returns the differing fields.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { isDeepStrictEqual } from 'node:util';
import type { IHealthDataReader } from '../reader';
import type { ReaderDescriptor } from '../types';

const inAnyOrder = (value: unknown): unknown => (Array.isArray(value) ? [...value].sort() : value);

export function checkDescriptor(reader: IHealthDataReader, entry: ReaderDescriptor): string[] {
  const actual = reader.descriptor;
  const fields = new Set([...Object.keys(entry), ...Object.keys(actual)]) as Set<keyof ReaderDescriptor>;
  return [...fields]
    .filter((field) => !isDeepStrictEqual(inAnyOrder(entry[field]), inAnyOrder(actual[field])))
    .map((field) => `rule 1: descriptor.${field} differs from the registry entry`);
}
