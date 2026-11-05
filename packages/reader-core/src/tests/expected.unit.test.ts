import type { Bundle, Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { diffSummary, summarise } from '../testing/expected';

const steps = (id: string, effectiveDateTime: string, value?: number): Observation => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  code: { coding: [{ system: 'urn:test', code: 'steps' }] },
  effectiveDateTime,
  ...(value === undefined
    ? { dataAbsentReason: { coding: [{ code: 'unknown' }] } }
    : { valueQuantity: { value, unit: 'steps' } })
});

const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    { resource: { resourceType: 'Patient', id: 'p' } },
    { resource: steps('b', '2026-03-02') },
    { resource: steps('a', '2026-03-01', 10) },
    { resource: steps('c', '2026-03-03', 12) }
  ]
};

describe('summarise', () => {
  it('counts types and codes, takes the effective range, and counts absent values', () => {
    expect(summarise(bundle)).toEqual({
      resourceTypes: { Observation: 3, Patient: 1 },
      observationCodes: { 'urn:test|steps': 3 },
      firstEffective: '2026-03-01',
      lastEffective: '2026-03-03',
      absentValues: 1
    });
  });
});

describe('diffSummary', () => {
  it('is empty for equal summaries and names each difference once', () => {
    const expected = summarise(bundle);
    expect(diffSummary(expected, expected)).toEqual([]);
    expect(diffSummary(expected, { ...expected, absentValues: 0, resourceTypes: { Observation: 3 } })).toEqual([
      'resourceTypes[Patient]: expected 1, got 0',
      'absentValues: expected 1, got 0'
    ]);
  });
});
