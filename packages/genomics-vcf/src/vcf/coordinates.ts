import { fatal } from '../issues';

/**
 * The one arithmetic in this connector that is both invisible and clinically
 * serious.
 *
 * VCF POS is **1-based and inclusive** (hts-specs §1.4.1: "the reference position,
 * with the 1st base having position 1"). The REF string starts at POS, so the
 * variant spans POS .. POS + REF.length - 1, inclusive, in that system.
 *
 * The HL7 Genomics Reporting IG does not fix one system. It requires the sender to
 * *declare* which one the `exact-start-end` Range is expressed in, via component
 * LOINC 92822-6, bound to LOINC answer list LL5323-2. That list has three members —
 * 0-based interval counting (LA30100-4), 0-based character counting (LA30101-2) and
 * 1-based character counting (LA30102-0) — verified by expanding
 * http://loinc.org/vs/LL5323-2 on tx.fhir.org (LOINC 2.82) on 2026-07-26. The IG's
 * own worked examples use 1-based character counting.
 *
 * So: no conversion is silently applied. The caller chooses a system, both systems
 * are implemented here, and whichever is chosen is stated in the emitted resource.
 *
 * The difference is exactly one base at the start and nothing at the end. A SNV at
 * POS 100 is 100..100 in 1-based character counting and 99..100 in 0-based interval
 * (interbase) counting. Getting that wrong shifts every variant in a report by one
 * base, which changes which codon — and therefore which protein consequence — a
 * variant lands in, while remaining entirely plausible on inspection.
 */
export type GenomicCoordinateSystem = 'one-based-character' | 'zero-based-interbase';

export interface GenomicRange {
  low: number;
  high: number;
}

function assertSpan(pos: number, refLength: number): void {
  if (!Number.isInteger(pos) || pos < 1) {
    throw fatal('VCF POS must be an integer of at least 1', 'validation', 'genomic-coordinates');
  }
  if (!Number.isInteger(refLength) || refLength < 1) {
    throw fatal('A VCF REF allele must be at least one base long', 'validation', 'genomic-coordinates');
  }
}

/**
 * 1-based, inclusive on both ends: the VCF coordinates unchanged.
 * A 1-base REF at POS p is p..p; a 3-base REF at p is p..p+2.
 */
export function oneBasedCharacterRange(pos: number, refLength: number): GenomicRange {
  assertSpan(pos, refLength);
  return { low: pos, high: pos + refLength - 1 };
}

/**
 * 0-based interbase (LOINC calls it "0-based interval counting"): coordinates name
 * the gaps *between* bases, so the span is half-open [low, high) and `high - low`
 * is the number of bases covered.
 *
 * A 1-base REF at POS p is p-1 .. p; a 3-base REF at p is p-1 .. p+2.
 */
export function zeroBasedInterbaseRange(pos: number, refLength: number): GenomicRange {
  assertSpan(pos, refLength);
  return { low: pos - 1, high: pos - 1 + refLength };
}

export function genomicRange(system: GenomicCoordinateSystem, pos: number, refLength: number): GenomicRange {
  return system === 'one-based-character'
    ? oneBasedCharacterRange(pos, refLength)
    : zeroBasedInterbaseRange(pos, refLength);
}
