/**
 * WHAT: Computes rule-support confidence as C × R × S per docs/contracts/confidence.md.
 * NOT:  Does not encode biomarker ids, clinical cutoffs, or disease probability.
 * GOVERNED BY: docs/contracts/confidence.md; docs/contracts/interpretation-contract.v0.2.schema.json
 * CORRECTNESS: Worked example in confidence.md must yield 0.2133
 * GOTCHA: Recency breakpoints (30/90/180) are contract constants, not clinical thresholds.
 */

import type { Contributor } from '@open-twin/interpretation-contract';

/** Contract recency map breakpoints (days) and factors — from confidence.md, not YAML. */
const RECENCY_LE_30 = 1.0;
const RECENCY_LE_90 = 0.7;
const RECENCY_LE_180 = 0.4;
const RECENCY_GT_180 = 0.1;
const DAY_30 = 30;
const DAY_90 = 90;
const DAY_180 = 180;

/** Age beyond which a contributor is status=stale for rule matching (confidence.md). */
export const STALE_AFTER_DAYS = DAY_180;

export function ageDays(observedAt: string, asOf: string): number {
  const a = Date.parse(observedAt);
  const b = Date.parse(asOf);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (b - a) / 86_400_000);
}

export function recencyFactor(deltaDays: number): number {
  if (deltaDays <= DAY_30) return RECENCY_LE_30;
  if (deltaDays <= DAY_90) return RECENCY_LE_90;
  if (deltaDays <= DAY_180) return RECENCY_LE_180;
  return RECENCY_GT_180;
}

/** Half-up to four decimal places (confidence.md). */
export function roundHalfUp4(n: number): number {
  return Math.round(n * 10_000 + Number.EPSILON) / 10_000;
}

export function computeConfidence(contributing: Contributor[], ruleStrength: number, asOf: string): number {
  if (contributing.length === 0) return 0;
  const present = contributing.filter((c) => c.status === 'present');
  const C = present.length / contributing.length;
  if (present.length === 0) return 0;

  let R = 1;
  for (const c of present) {
    if (c.observed_at == null || c.observed_at === '') {
      R = 0;
      break;
    }
    R = Math.min(R, recencyFactor(ageDays(c.observed_at, asOf)));
  }

  const S = ruleStrength;
  return roundHalfUp4(C * R * S);
}
