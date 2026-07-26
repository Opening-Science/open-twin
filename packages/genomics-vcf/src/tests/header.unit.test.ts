import { describe, expect, it } from 'vitest';
import { IssueLog } from '../issues';
import { parseHeader, parseStructuredBody, parseVcfNumber } from '../vcf/header';

describe('structured header lines', () => {
  it('keeps a > that is inside a quoted description', () => {
    // Verbatim from the committed dbSNP 135 header. Any parser that looks for the
    // last '>' on the line, or slices off the final character, truncates this.
    const fields = parseStructuredBody(
      '<ID=G5,Number=0,Type=Flag,Description=">5% minor allele frequency in 1+ populations">'
    );
    expect(fields?.get('ID')).toBe('G5');
    expect(fields?.get('Description')).toBe('>5% minor allele frequency in 1+ populations');
  });

  it('keeps a comma that is inside a quoted description', () => {
    const fields = parseStructuredBody(
      '<ID=GMAF,Number=1,Type=Float,Description="Global Minor Allele Frequency [0, 0.5]">'
    );
    expect(fields?.get('Type')).toBe('Float');
    expect(fields?.get('Description')).toBe('Global Minor Allele Frequency [0, 0.5]');
  });

  it('unescapes an escaped quote and an escaped backslash', () => {
    const fields = parseStructuredBody('<ID=X,Number=1,Type=String,Description="a \\"quoted\\" c:\\\\path">');
    expect(fields?.get('Description')).toBe('a "quoted" c:\\path');
  });

  it('returns nothing for a body that never closes', () => {
    expect(parseStructuredBody('<ID=X,Number=1,Type=String')).toBeUndefined();
    expect(parseStructuredBody('ID=X')).toBeUndefined();
  });
});

describe('the Number attribute', () => {
  it('reads the per-allele and per-genotype forms as themselves, not as counts', () => {
    expect(parseVcfNumber('A')).toBe('A');
    expect(parseVcfNumber('R')).toBe('R');
    expect(parseVcfNumber('G')).toBe('G');
  });

  it('reads . as unbounded and a numeral as a fixed count', () => {
    expect(parseVcfNumber('.')).toBe('unbounded');
    expect(parseVcfNumber('0')).toBe(0);
    expect(parseVcfNumber('3')).toBe(3);
  });

  it('rejects rather than defaults when the attribute is not a Number', () => {
    expect(parseVcfNumber('x')).toBeUndefined();
    expect(parseVcfNumber('-1')).toBeUndefined();
    expect(parseVcfNumber('2.5')).toBeUndefined();
  });
});

describe('parseHeader', () => {
  const header = [
    '##fileformat=VCFv4.2',
    '##fileDate=20111104',
    '##reference=GRCh37.3',
    '##reference=file:///seq/human_g1k_v37.fasta',
    '##contig=<ID=1,length=249250621,assembly=b37>',
    '##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">',
    '##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">',
    '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Allelic depths">',
    '##someToolCommandLine=--input /home/someone/private/patient.bam',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tNA12878\t'
  ];

  it('reads the declarations it needs and ignores the ones it does not', () => {
    const issues = new IssueLog();
    const { header: parsed, chromLineIndex } = parseHeader(header, issues);

    expect(parsed.fileformat).toBe('VCFv4.2');
    expect(parsed.fileDate).toBe('20111104');
    expect(parsed.reference).toEqual(['GRCh37.3', 'file:///seq/human_g1k_v37.fasta']);
    expect(parsed.contigs.get('1')).toEqual({ id: '1', length: 249_250_621, assembly: 'b37' });
    expect(parsed.info.get('DP')).toEqual({ id: 'DP', number: 1, type: 'Integer' });
    expect(parsed.info.get('AF')).toEqual({ id: 'AF', number: 'A', type: 'Float' });
    expect(parsed.format.get('AD')).toEqual({ id: 'AD', number: 'R', type: 'Integer' });
    expect(chromLineIndex).toBe(9);
  });

  it('does not read a trailing tab on #CHROM as a second, nameless sample', () => {
    // The committed HiSeq fixture ends its #CHROM line with a tab. Counting columns
    // naively turns a single-sample file into what looks like a joint call, and the
    // connector then refuses to convert it at all.
    const issues = new IssueLog();
    const { header: parsed } = parseHeader(header, issues);
    expect(parsed.samples).toEqual(['NA12878']);
  });

  it('reports a missing ##fileformat instead of assuming one', () => {
    const issues = new IssueLog();
    parseHeader(
      ['##INFO=<ID=DP,Number=1,Type=Integer,Description="d">', '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO'],
      issues
    );
    expect(issues.count('fileformat-missing')).toBe(1);
  });

  it('reports a version outside the range it was written against', () => {
    const issues = new IssueLog();
    parseHeader(['##fileformat=VCFv4.5', '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO'], issues);
    expect(issues.count('fileformat-out-of-scope')).toBe(1);
  });

  it('reports a declaration it could not read rather than dropping it silently', () => {
    const issues = new IssueLog();
    const { header: parsed } = parseHeader(
      [
        '##fileformat=VCFv4.2',
        '##INFO=<ID=DP,Number=1,Type=Decimal,Description="d">',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO'
      ],
      issues
    );
    expect(parsed.info.has('DP')).toBe(false);
    expect(issues.count('header-declaration-invalid')).toBe(1);
  });
});
