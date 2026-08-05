/**
 * WHAT: Normative confidence arithmetic for interpretation-contract.v0.2 (C × R × S).
 * NOT:  Does not invent rule strength, interpret biomarkers, or render risk.
 * GOVERNED BY: docs/contracts/confidence.md; DECISIONS.md#d12
 * CORRECTNESS: docs/contracts/confidence.md — elapsed-day floor, half-up rational round
 */

const MS_PER_DAY = 86_400_000;

/** Exact non-negative rational a/b in lowest terms is not required; callers keep integers. */
export interface Rational {
  num: bigint;
  den: bigint;
}

export function ageDaysUtc(asOfIso: string, observedAtIso: string): number {
  const asOf = Date.parse(asOfIso);
  const observed = Date.parse(observedAtIso);
  if (Number.isNaN(asOf) || Number.isNaN(observed)) {
    throw new Error('as_of and observed_at must be parseable UTC instants');
  }
  const m = asOf - observed;
  if (m < 0) return 0;
  return Math.floor(m / MS_PER_DAY);
}

export function recencyFromAgeDays(deltaT: number): number {
  if (deltaT <= 30) return 1.0;
  if (deltaT <= 90) return 0.7;
  if (deltaT <= 180) return 0.4;
  return 0.1;
}

/** Parse a finite decimal string (e.g. "0.00015", "0.8") into an exact rational. */
export function decimalStringToRational(s: string): Rational {
  const t = s.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) {
    throw new Error(`not a plain decimal: ${s}`);
  }
  const neg = t.startsWith('-');
  const body = neg ? t.slice(1) : t;
  const [whole, frac = ''] = body.split('.');
  const den = 10n ** BigInt(frac.length);
  const num = BigInt(whole) * den + BigInt(frac === '' ? 0 : frac);
  return { num: neg ? -num : num, den };
}

export function mul(a: Rational, b: Rational): Rational {
  return { num: a.num * b.num, den: a.den * b.den };
}

/**
 * Half-up to four decimal places for non-negative P = num/den.
 * scaled = floor((2*num*10000 + den) / (2*den)); result = scaled/10000.
 */
export function roundHalfUp4(p: Rational): Rational {
  if (p.num < 0n) throw new Error('confidence product must be non-negative');
  if (p.den <= 0n) throw new Error('denominator must be positive');
  const scaled = (2n * p.num * 10000n + p.den) / (2n * p.den);
  return { num: scaled, den: 10000n };
}

export function rationalToFixed4(p: Rational): string {
  const r = roundHalfUp4(p);
  const whole = r.num / 10000n;
  const frac = r.num % 10000n;
  return `${whole}.${frac.toString().padStart(4, '0')}`;
}

export function computeConfidence(args: {
  presentCount: number;
  contributingCount: number;
  /** Minimum r(Δt) over present contributors, or 0 if none present. */
  R: number | string;
  /** Rule strength as decimal string preferred (exact). */
  S: number | string;
}): { rational: Rational; fixed4: string } {
  if (args.contributingCount <= 0) {
    throw new Error('contributingCount must be > 0');
  }
  if (args.presentCount < 0 || args.presentCount > args.contributingCount) {
    throw new Error('presentCount out of range');
  }
  const C: Rational = {
    num: BigInt(args.presentCount),
    den: BigInt(args.contributingCount)
  };
  const R = typeof args.R === 'string' ? decimalStringToRational(args.R) : decimalStringToRational(String(args.R));
  const S = typeof args.S === 'string' ? decimalStringToRational(args.S) : decimalStringToRational(String(args.S));
  const product = mul(mul(C, R), S);
  const rounded = roundHalfUp4(product);
  return { rational: rounded, fixed4: rationalToFixed4(product) };
}
