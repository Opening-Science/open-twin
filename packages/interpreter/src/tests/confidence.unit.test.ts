import {
  ageDaysUtc,
  type Contributor,
  computeConfidence as contractConfidence
} from '@open-twin/interpretation-contract';
import { describe, expect, it } from 'vitest';
import { ageDays, computeConfidence, roundHalfUp4 } from '../confidence.js';

describe('confidence.md worked example', () => {
  it('yields 0.2133', () => {
    const asOf = '2026-07-28T00:00:00Z';
    const confidence = computeConfidence(
      [
        {
          biomarker_id: 'BM-072',
          status: 'present',
          observed_at: '2026-07-01T00:00:00Z',
          reference_interval_id: 'RI-020'
        },
        {
          biomarker_id: 'BM-190',
          status: 'present',
          observed_at: '2026-04-01T00:00:00Z',
          reference_interval_id: null
        },
        {
          biomarker_id: 'BM-200',
          status: 'missing',
          observed_at: null,
          reference_interval_id: null
        }
      ],
      0.8,
      asOf
    );
    expect(confidence).toBe(0.2133);
    expect(roundHalfUp4((2 / 3) * 0.4 * 0.8)).toBe(0.2133);
  });
});

describe('normative confidence boundaries', () => {
  const asOf = '2026-09-23T12:00:00Z';
  it.each([30, 30.5, 31, 90, 90.5, 91, 180, 180.5, 181])('uses whole elapsed days at %s days', (days) => {
    const observed = new Date(Date.parse(asOf) - days * 86400000).toISOString();
    const contributors: Contributor[] = [
      { biomarker_id: 'sample', status: 'present', observed_at: observed, reference_interval_id: null }
    ];
    const factor = days < 31 ? '1' : days < 91 ? '0.7' : days < 181 ? '0.4' : '0.1';
    expect(ageDays(observed, asOf)).toBe(ageDaysUtc(asOf, observed));
    expect(computeConfidence(contributors, 0.7, asOf)).toBe(
      Number(contractConfidence({ presentCount: 1, contributingCount: 1, R: factor, S: '0.7' }).fixed4)
    );
  });

  it('uses exact decimal half-up rounding and handles small decimal strengths', () => {
    const present: Contributor = {
      biomarker_id: 'sample',
      status: 'present',
      observed_at: asOf,
      reference_interval_id: null
    };
    expect(computeConfidence([present], 0.00015, asOf)).toBe(0.0002);
    expect(computeConfidence([present], 1e-7, asOf)).toBe(0);
    expect(() => computeConfidence([present], 2, asOf)).toThrow();
    expect(() => computeConfidence([], 0.7, asOf)).toThrow();
  });

  it('rejects timezone-less instants rather than treating them as local time', () => {
    const contributor: Contributor = {
      biomarker_id: 'sample',
      status: 'present',
      observed_at: '2026-09-23T12:00:00',
      reference_interval_id: null
    };
    expect(() => computeConfidence([contributor], 0.7, asOf)).toThrow(/offset|timezone/);
  });
});
