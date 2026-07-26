import type { VcfGenotype } from './types';

export type AllelicState = 'homozygous' | 'heterozygous' | 'hemizygous';

/** Whether the ALT allele under consideration is in this sample's genotype. */
export type VariantPresence = 'present' | 'absent' | 'no-call' | 'indeterminate';

export interface AlleleCall {
  presence: VariantPresence;
  /**
   * Undefined whenever zygosity cannot be stated. The IG's allelic-state component
   * has a required value, so "we do not know" is expressed by leaving the component
   * out — not by a data-absent-reason inside it, and never by a default.
   */
  allelicState?: AllelicState;
}

/**
 * Reads one sample's GT for one ALT allele.
 *
 * `altIndex` is the VCF allele index: 0 is REF, 1 the first ALT. A multi-allelic
 * line is asked about each of its ALTs separately, so `1/2` is heterozygous for both
 * ALT 1 and ALT 2 — which is correct, and is what a "second ALT is homozygous
 * because it is the only non-reference allele" shortcut gets wrong.
 *
 * A partial call such as `./1` is deliberately *present with no zygosity*. Counting
 * only the called alleles would make it look homozygous, because the one allele that
 * was called matches. Ploidy is therefore taken from the number of GT positions, not
 * from the number of positions that were successfully called.
 */
export function callForAlt(genotype: VcfGenotype | undefined, altIndex: number): AlleleCall {
  if (!genotype || genotype.alleles.length === 0) return { presence: 'no-call' };

  const ploidy = genotype.alleles.length;
  const uncalled = genotype.alleles.filter((allele) => allele === null).length;
  const matching = genotype.alleles.filter((allele) => allele === altIndex).length;

  if (uncalled === ploidy) return { presence: 'no-call' };

  if (matching === 0) {
    // Some position is uncalled, so the allele may still be there. LL1971-2 has a
    // concept for exactly this, and it is not "absent".
    return uncalled > 0 ? { presence: 'indeterminate' } : { presence: 'absent' };
  }

  if (uncalled > 0) return { presence: 'present' };
  if (ploidy === 1) return { presence: 'present', allelicState: 'hemizygous' };
  return { presence: 'present', allelicState: matching === ploidy ? 'homozygous' : 'heterozygous' };
}
