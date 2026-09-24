/**
 * WHAT: Computes rule-support confidence as C × R × S per docs/contracts/confidence.md.
 * NOT:  Does not encode biomarker ids, clinical cutoffs, or disease probability.
 * GOVERNED BY: docs/contracts/confidence.md; docs/contracts/interpretation-contract.v0.2.schema.json
 * CORRECTNESS: Worked example in confidence.md must yield 0.2133
 * GOTCHA: Recency breakpoints (30/90/180) are contract constants, not clinical thresholds.
 */

import {
  ageDaysUtc,
  type Contributor,
  computeConfidence as contractConfidence,
  decimalStringToRational,
  rationalToFixed4,
  recencyFromAgeDays
} from '@open-twin/interpretation-contract';

/** Whole elapsed days, shared with the normative contract. */
export const STALE_AFTER_DAYS = 180;

export function ageDays(observedAt: string, asOf: string): number {
  return ageDaysUtc(asOf, observedAt);
}

export const recencyFactor = recencyFromAgeDays;

/** Preserve the number's decimal spelling, including small YAML strengths. */
function decimal(n: number): string {
  return String(n).replace(
    /^(\d)(?:\.(\d+))?e-(\d+)$/,
    (_match, first, rest, exponent) => `0.${'0'.repeat(Number(exponent) - 1)}${first}${rest ?? ''}`
  );
}

/** Compatibility wrapper; rounding itself is owned by the contract. */
export function roundHalfUp4(n: number): number {
  return Number(rationalToFixed4(decimalStringToRational(decimal(n))));
}

export function computeConfidence(contributing: Contributor[], ruleStrength: number, asOf: string): number {
  // Validate as_of even when no present contributors need a recency calculation.
  ageDaysUtc(asOf, asOf);
  const present = contributing.filter((c) => c.status === 'present');
  let recency = present.length === 0 ? 0 : 1;
  for (const c of present) {
    const factor = c.observed_at ? recencyFromAgeDays(ageDaysUtc(asOf, c.observed_at)) : 0;
    recency = Math.min(recency, factor);
  }
  return Number(
    contractConfidence({
      presentCount: present.length,
      contributingCount: contributing.length,
      R: decimal(recency),
      S: decimal(ruleStrength)
    }).fixed4
  );
}
