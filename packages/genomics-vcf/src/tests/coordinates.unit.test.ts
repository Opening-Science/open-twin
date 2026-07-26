import { ConnectorError } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import { genomicRange, oneBasedCharacterRange, zeroBasedInterbaseRange } from '../vcf/coordinates';

/**
 * The off-by-one that is invisible on inspection.
 *
 * These assertions are worked out from the two definitions rather than from what the
 * code returns: VCF POS is 1-based inclusive (hts-specs §1.4.1), and 0-based
 * interbase coordinates name the gaps between bases so a span is half-open.
 */
describe('genomic coordinate systems', () => {
  it('leaves a VCF position untouched in 1-based character counting', () => {
    expect(oneBasedCharacterRange(100, 1)).toEqual({ low: 100, high: 100 });
    expect(oneBasedCharacterRange(10351, 3)).toEqual({ low: 10351, high: 10353 });
  });

  it('moves the start back one base, and the end not at all, in 0-based interbase', () => {
    expect(zeroBasedInterbaseRange(100, 1)).toEqual({ low: 99, high: 100 });
    expect(zeroBasedInterbaseRange(10351, 3)).toEqual({ low: 10350, high: 10353 });
  });

  it('keeps the 1-based span inclusive: high - low + 1 is the number of bases', () => {
    for (const refLength of [1, 2, 3, 17, 250]) {
      const range = oneBasedCharacterRange(4242, refLength);
      expect(range.high - range.low + 1).toBe(refLength);
    }
  });

  it('keeps the interbase span half-open: high - low is the number of bases', () => {
    for (const refLength of [1, 2, 3, 17, 250]) {
      const range = zeroBasedInterbaseRange(4242, refLength);
      expect(range.high - range.low).toBe(refLength);
    }
  });

  it('differs between the two systems by exactly one at the start and zero at the end', () => {
    for (const pos of [1, 2, 664, 10351, 249_250_621]) {
      for (const refLength of [1, 4]) {
        const oneBased = oneBasedCharacterRange(pos, refLength);
        const interbase = zeroBasedInterbaseRange(pos, refLength);
        expect(oneBased.low - interbase.low).toBe(1);
        // The ends coincide: (pos + len - 1) - (pos - 1 + len) = 0, for every length.
        // That is the whole difference between the systems, and it is why converting
        // "both endpoints" by subtracting one is wrong.
        expect(oneBased.high - interbase.high).toBe(0);
      }
    }
  });

  it('handles the first base of a contig without going negative', () => {
    expect(zeroBasedInterbaseRange(1, 1)).toEqual({ low: 0, high: 1 });
  });

  it('dispatches on the requested system rather than a default', () => {
    expect(genomicRange('one-based-character', 664, 1)).toEqual({ low: 664, high: 664 });
    expect(genomicRange('zero-based-interbase', 664, 1)).toEqual({ low: 663, high: 664 });
  });

  it('refuses a position or a REF length that cannot be a VCF span', () => {
    expect(() => oneBasedCharacterRange(0, 1)).toThrow(ConnectorError);
    expect(() => oneBasedCharacterRange(1.5, 1)).toThrow(ConnectorError);
    expect(() => zeroBasedInterbaseRange(10, 0)).toThrow(ConnectorError);
  });
});
