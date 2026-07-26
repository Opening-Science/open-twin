import { describe, expect, it } from 'vitest';
import { IssueLog } from '../issues';
import { expectedValueCount, parseGenotype, parseInfo } from '../vcf/records';
import type { VcfHeader } from '../vcf/types';
import { CHROM_LINE_SINGLE_SAMPLE, CHROM_LINE_SITES_ONLY, parseVcf } from './helpers';

function headerWith(info: VcfHeader['info']): VcfHeader {
  return { info, format: new Map(), contigs: new Map(), reference: [], samples: [] };
}

describe('declared cardinality', () => {
  it('expands A, R and G rather than counting the commas that happen to be there', () => {
    expect(expectedValueCount('A', 2)).toBe(2);
    expect(expectedValueCount('R', 2)).toBe(3);
    // Diploid, one ALT: AA, AB, BB.
    expect(expectedValueCount('G', 1, 2)).toBe(3);
    // Diploid, two ALTs: AA, AB, BB, AC, BC, CC.
    expect(expectedValueCount('G', 2, 2)).toBe(6);
    // Haploid, two ALTs: one per allele.
    expect(expectedValueCount('G', 2, 1)).toBe(3);
  });

  it('declines to guess when the count is genuinely not fixed', () => {
    expect(expectedValueCount('unbounded', 2)).toBeUndefined();
    expect(expectedValueCount('G', 2)).toBeUndefined();
  });

  it('takes a fixed count from the declaration', () => {
    expect(expectedValueCount(3, 9)).toBe(3);
    expect(expectedValueCount(0, 9)).toBe(0);
  });
});

describe('INFO parsing', () => {
  const header = headerWith(
    new Map([
      ['DP', { id: 'DP', number: 1 as const, type: 'Integer' as const }],
      ['AF', { id: 'AF', number: 'A' as const, type: 'Float' as const }],
      ['DB', { id: 'DB', number: 0 as const, type: 'Flag' as const }],
      ['VC', { id: 'VC', number: 1 as const, type: 'String' as const }]
    ])
  );

  it('applies the declared Type instead of inferring it from the text', () => {
    const issues = new IssueLog();
    const info = parseInfo('DP=1019;VC=1019;DB', header, 1, issues);
    expect(info.get('DP')).toEqual([1019]);
    // Same characters, declared String: it must stay a string.
    expect(info.get('VC')).toEqual(['1019']);
    expect(info.get('DB')).toEqual([true]);
  });

  it('records a missing element as missing, never as zero', () => {
    const issues = new IssueLog();
    const info = parseInfo('DP=.', header, 1, issues);
    expect(info.get('DP')).toEqual([null]);
    expect(info.get('DP')?.[0]).not.toBe(0);
  });

  it('splits a per-ALT field into one element per ALT', () => {
    const issues = new IssueLog();
    const info = parseInfo('AF=0.25,0.5', header, 2, issues);
    expect(info.get('AF')).toEqual([0.25, 0.5]);
    expect(issues.count('info-cardinality-mismatch')).toBe(0);
  });

  it('reports a per-ALT field whose element count disagrees with the ALT count', () => {
    const issues = new IssueLog();
    parseInfo('AF=0.5', header, 2, issues);
    expect(issues.count('info-cardinality-mismatch')).toBe(1);
  });

  it('reports a key the header never declared instead of guessing its type', () => {
    const issues = new IssueLog();
    const info = parseInfo('MYSTERY=7', header, 1, issues);
    expect(info.get('MYSTERY')).toEqual(['7']);
    expect(issues.count('info-field-undeclared')).toBe(1);
  });

  it('reports a value that contradicts its declared Type and stores it as missing', () => {
    const issues = new IssueLog();
    const info = parseInfo('DP=0.5', header, 1, issues);
    expect(info.get('DP')).toEqual([null]);
    expect(issues.count('info-value-untypable')).toBe(1);
  });
});

describe('GT parsing', () => {
  it('reads allele indices and the phasing separator', () => {
    expect(parseGenotype('0/1')).toEqual({ alleles: [0, 1], phased: false });
    expect(parseGenotype('0|1')).toEqual({ alleles: [0, 1], phased: true });
    expect(parseGenotype('1/2')).toEqual({ alleles: [1, 2], phased: false });
  });

  it('keeps a no-call position as no-call rather than as allele 0', () => {
    expect(parseGenotype('./.')).toEqual({ alleles: [null, null], phased: false });
    expect(parseGenotype('./1')).toEqual({ alleles: [null, 1], phased: false });
  });

  it('reads a haploid call as one allele, not as a malformed diploid one', () => {
    // Nothing to phase with a single allele, so `phased` must not be asserted.
    expect(parseGenotype('1')).toEqual({ alleles: [1], phased: false });
  });

  it('rejects a value that is not a genotype', () => {
    expect(parseGenotype('A/T')).toBeUndefined();
    expect(parseGenotype('-1/0')).toBeUndefined();
  });
});

describe('data lines', () => {
  const declarations = [
    '##fileformat=VCFv4.2',
    '##INFO=<ID=DP,Number=1,Type=Integer,Description="d">',
    '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
    '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Allelic depths">'
  ];

  it('reads the eight fixed columns and the sample column', () => {
    const { records } = parseVcf([
      ...declarations,
      CHROM_LINE_SINGLE_SAMPLE,
      'chr1\t664\trs1\tC\tG\t30.66\tPASS\tDP=2\tGT:AD\t1/1:0,2'
    ]);
    const record = records[0];
    expect(record?.chrom).toBe('chr1');
    expect(record?.pos).toBe(664);
    expect(record?.ids).toEqual(['rs1']);
    expect(record?.ref).toBe('C');
    expect(record?.alts).toEqual(['G']);
    expect(record?.qual).toBe(30.66);
    expect(record?.filters).toEqual(['PASS']);
    expect(record?.samples.get('S1')?.get('AD')).toEqual([0, 2]);
  });

  it('reads a missing ID and a missing FILTER as absent, not as literal dots', () => {
    const { records } = parseVcf([...declarations, CHROM_LINE_SITES_ONLY, 'chr1\t664\t.\tC\tG\t.\t.\tDP=2']);
    expect(records[0]?.ids).toEqual([]);
    expect(records[0]?.filters).toEqual([]);
    expect(records[0]?.qual).toBeNull();
  });

  it('splits a multi-allelic ALT column into its alleles', () => {
    const { records } = parseVcf([
      ...declarations,
      CHROM_LINE_SITES_ONLY,
      '1\t10351\trs145072688\tCTA\tC,CA\t.\tPASS\tDP=2'
    ]);
    expect(records[0]?.alts).toEqual(['C', 'CA']);
  });

  it('skips a line that does not have the eight mandatory columns', () => {
    const { records, issues } = parseVcf([...declarations, CHROM_LINE_SITES_ONLY, 'chr1\t664\t.\tC\tG']);
    expect(records).toHaveLength(0);
    expect(issues.count('record-malformed')).toBe(1);
  });

  it('skips a line whose POS is not a position', () => {
    const { records, issues } = parseVcf([...declarations, CHROM_LINE_SITES_ONLY, 'chr1\t0\t.\tC\tG\t.\tPASS\tDP=2']);
    expect(records).toHaveLength(0);
    expect(issues.count('record-position-invalid')).toBe(1);
  });

  it('skips a line whose REF is not a run of bases', () => {
    const { records, issues } = parseVcf([
      ...declarations,
      CHROM_LINE_SITES_ONLY,
      'chr1\t664\t.\tXY\tG\t.\tPASS\tDP=2'
    ]);
    expect(records).toHaveLength(0);
    expect(issues.count('record-ref-invalid')).toBe(1);
  });

  it('reports a FORMAT array whose length disagrees with the allele count', () => {
    const { issues } = parseVcf([
      ...declarations,
      CHROM_LINE_SINGLE_SAMPLE,
      // AD is Number=R, so with one ALT it must carry two values.
      'chr1\t664\t.\tC\tG\t.\tPASS\tDP=2\tGT:AD\t0/1:5'
    ]);
    expect(issues.count('format-cardinality-mismatch')).toBe(1);
  });

  it('treats a dropped trailing FORMAT field as absent, not as missing-valued', () => {
    const { records } = parseVcf([
      ...declarations,
      CHROM_LINE_SINGLE_SAMPLE,
      'chr1\t664\t.\tC\tG\t.\tPASS\tDP=2\tGT:AD\t0/1'
    ]);
    expect(records[0]?.samples.get('S1')?.has('AD')).toBe(false);
  });
});
