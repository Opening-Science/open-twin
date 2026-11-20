import type { Bundle, Observation } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import { summarise } from '../testing/expected';

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

  it('keys a code by all its codings, so two codes that share the first one stay apart', () => {
    const coded = (id: string, second: string): Observation => ({
      ...steps(id, '2026-03-01', 1),
      code: {
        coding: [
          { system: 'urn:test', code: 'A' },
          { system: 'urn:test', code: second }
        ]
      }
    });
    const summary = summarise({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: coded('x', 'B') }, { resource: coded('y', 'C') }]
    });

    expect(summary.observationCodes).toEqual({ 'urn:test|A,urn:test|B': 1, 'urn:test|A,urn:test|C': 1 });
  });

  it('orders the effective range by instant, so offsets do not mislead a string sort', () => {
    const lateByString = steps('x', '2026-03-02T01:00:00+02:00', 1);
    const earlyByString = steps('y', '2026-03-01T23:00:00-05:00', 2);
    const summary = summarise({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: lateByString }, { resource: earlyByString }]
    });

    expect(summary.firstEffective).toBe('2026-03-02T01:00:00+02:00');
    expect(summary.lastEffective).toBe('2026-03-01T23:00:00-05:00');
  });

  it('leaves out an effective time that does not parse, wherever it sits', () => {
    const entry = [steps('x', 'not-a-date', 1), steps('y', '2026-03-02', 2), steps('z', '2026-03-01', 3)];
    const summary = summarise({
      resourceType: 'Bundle',
      type: 'collection',
      entry: entry.map((resource) => ({ resource }))
    });

    expect(summary.firstEffective).toBe('2026-03-01');
    expect(summary.lastEffective).toBe('2026-03-02');
  });
});
