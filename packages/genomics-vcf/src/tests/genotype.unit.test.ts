import { describe, expect, it } from 'vitest';
import { callForAlt } from '../vcf/genotype';
import { parseGenotype } from '../vcf/records';

function call(gt: string, altIndex: number) {
  return callForAlt(parseGenotype(gt), altIndex);
}

describe('allelic state from GT', () => {
  it('reads a diploid heterozygote and homozygote', () => {
    expect(call('0/1', 1)).toEqual({ presence: 'present', allelicState: 'heterozygous' });
    expect(call('1/1', 1)).toEqual({ presence: 'present', allelicState: 'homozygous' });
  });

  it('reads a haploid call as hemizygous, not homozygous', () => {
    expect(call('1', 1)).toEqual({ presence: 'present', allelicState: 'hemizygous' });
  });

  it('ignores phasing when deciding zygosity', () => {
    expect(call('0|1', 1)).toEqual(call('0/1', 1));
    expect(call('1|0', 1)).toEqual(call('0/1', 1));
  });

  it('calls both alleles of a 1/2 genotype heterozygous', () => {
    // The trap: at a multi-allelic site, ALT 2 is the only non-reference allele
    // *other than* ALT 1, and treating "no reference allele present" as homozygous
    // publishes two homozygous variants for a compound heterozygote.
    expect(call('1/2', 1)).toEqual({ presence: 'present', allelicState: 'heterozygous' });
    expect(call('1/2', 2)).toEqual({ presence: 'present', allelicState: 'heterozygous' });
  });

  it('reports an ALT the genotype does not contain as absent, with no zygosity', () => {
    expect(call('0/0', 1)).toEqual({ presence: 'absent' });
    expect(call('0/1', 2)).toEqual({ presence: 'absent' });
  });

  it('reports a fully uncalled genotype as a no call', () => {
    expect(call('./.', 1)).toEqual({ presence: 'no-call' });
    expect(call('.', 1)).toEqual({ presence: 'no-call' });
  });

  it('refuses to state zygosity for a partial call', () => {
    // './1' has one called allele and it matches, so counting only called alleles
    // makes it look homozygous. It is not: the other position is unknown.
    expect(call('./1', 1)).toEqual({ presence: 'present' });
    expect(call('./1', 1).allelicState).toBeUndefined();
  });

  it('reports a partial call that does not contain the ALT as indeterminate, not absent', () => {
    expect(call('./0', 1)).toEqual({ presence: 'indeterminate' });
  });

  it('reports a no call when there is no genotype at all', () => {
    expect(callForAlt(undefined, 1)).toEqual({ presence: 'no-call' });
  });

  it('reads a triploid call', () => {
    expect(call('1/1/1', 1)).toEqual({ presence: 'present', allelicState: 'homozygous' });
    expect(call('0/1/1', 1)).toEqual({ presence: 'present', allelicState: 'heterozygous' });
  });
});
