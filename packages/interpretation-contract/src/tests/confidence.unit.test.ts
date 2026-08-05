/**
 * WHAT: Boundary and tie-case vectors for docs/contracts/confidence.md arithmetic.
 * NOT:  Does not validate full interpretation documents.
 * GOVERNED BY: docs/contracts/confidence.md
 * CORRECTNESS: docs/contracts/confidence.md elapsed-day + half-up tables
 */
import { describe, expect, it } from 'vitest';
import {
  ageDaysUtc,
  computeConfidence,
  decimalStringToRational,
  rationalToFixed4,
  recencyFromAgeDays,
  roundHalfUp4
} from '../confidence.js';

describe('confidence elapsed-day procedure', () => {
  const asOf = '2026-07-28T00:00:00.000Z';

  it('clamps negative age to 0 before flooring', () => {
    expect(ageDaysUtc(asOf, '2026-07-29T00:00:00.000Z')).toBe(0);
    expect(recencyFromAgeDays(0)).toBe(1.0);
  });

  it('floors fractional SI days (30.5 → 30, not 31)', () => {
    // 30 days + 12 hours = 30.5 SI days
    const observed = new Date(Date.parse(asOf) - (30 * 86_400_000 + 12 * 3_600_000)).toISOString();
    expect(ageDaysUtc(asOf, observed)).toBe(30);
    expect(recencyFromAgeDays(30)).toBe(1.0);
  });

  it('hits table boundaries 30/31, 90/91, 180/181', () => {
    expect(recencyFromAgeDays(30)).toBe(1.0);
    expect(recencyFromAgeDays(31)).toBe(0.7);
    expect(recencyFromAgeDays(90)).toBe(0.7);
    expect(recencyFromAgeDays(91)).toBe(0.4);
    expect(recencyFromAgeDays(180)).toBe(0.4);
    expect(recencyFromAgeDays(181)).toBe(0.1);
  });
});

describe('confidence half-up rational rounding', () => {
  it('matches the worked example 2/3 × 0.4 × 0.8 → 0.2133', () => {
    const { fixed4 } = computeConfidence({
      presentCount: 2,
      contributingCount: 3,
      R: '0.4',
      S: '0.8'
    });
    expect(fixed4).toBe('0.2133');
  });

  it('half-tie 0.00015 → 0.0002 (not binary-float 0.0001)', () => {
    const { fixed4 } = computeConfidence({
      presentCount: 1,
      contributingCount: 1,
      R: '1',
      S: '0.00015'
    });
    expect(fixed4).toBe('0.0002');
  });

  it('serializes with exactly four fractional digits', () => {
    expect(rationalToFixed4(roundHalfUp4(decimalStringToRational('1')))).toBe('1.0000');
    expect(rationalToFixed4(roundHalfUp4(decimalStringToRational('0.5')))).toBe('0.5000');
  });
});
