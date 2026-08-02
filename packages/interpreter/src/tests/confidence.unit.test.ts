import { describe, expect, it } from 'vitest';
import { computeConfidence, roundHalfUp4 } from '../confidence.js';

describe('confidence.md worked example', () => {
  it('yields 0.2133', () => {
    const asOf = '2026-07-28T00:00:00Z';
    const confidence = computeConfidence(
      [
        {
          biomarker_id: 'BM-072',
          status: 'present',
          observed_at: '2026-07-01T00:00:00Z',
          reference_interval_id: 'RI-020',
        },
        {
          biomarker_id: 'BM-190',
          status: 'present',
          observed_at: '2026-04-01T00:00:00Z',
          reference_interval_id: null,
        },
        {
          biomarker_id: 'BM-200',
          status: 'missing',
          observed_at: null,
          reference_interval_id: null,
        },
      ],
      0.8,
      asOf,
    );
    expect(confidence).toBe(0.2133);
    expect(roundHalfUp4((2 / 3) * 0.4 * 0.8)).toBe(0.2133);
  });
});
