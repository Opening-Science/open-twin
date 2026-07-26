import { describe, expect, it } from 'vitest';
import { vcfToFhirBundle } from '../fhir/bundleBuilder';
import { CHROM_LINE_SINGLE_SAMPLE, readFixture } from './helpers';

/**
 * A VCF is genomic data about an identifiable person. Nothing from it may reach a
 * diagnostic string — those land in application logs, stack traces, error-reporting
 * services and CI output, none of which are covered by whatever consent the file was
 * collected under.
 *
 * This is asserted by construction: a VCF is built whose every field is a distinctive
 * token, it is put through the paths that produce every reportable issue kind, and
 * the resulting OperationOutcome is searched for each token.
 */
const TOKENS = {
  sample: 'ZZSAMPLENAMEZZ',
  chrom: 'ZZCONTIGZZ',
  id: 'ZZVARIANTIDZZ',
  infoKey: 'ZZINFOKEYZZ',
  infoValue: 'ZZINFOVALUEZZ',
  formatKey: 'ZZFORMATKEYZZ',
  build: 'ZZBUILDZZ',
  description: 'ZZDESCRIPTIONZZ',
  filter: 'ZZFILTERZZ'
} as const;

const HOSTILE_VCF = [
  '##fileformat=VCFv9.9',
  `##reference=${TOKENS.build}`,
  `##FILTER=<ID=${TOKENS.filter},Description="${TOKENS.description}">`,
  `##INFO=<ID=DP,Number=1,Type=Integer,Description="${TOKENS.description}">`,
  '##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">',
  '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
  '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Allelic depths">',
  '##INFO=<ID=BROKEN,Number=nonsense,Type=Integer,Description="d">',
  CHROM_LINE_SINGLE_SAMPLE.replace('\tS1', `\t${TOKENS.sample}`),
  // Every reportable kind, one line each.
  `${TOKENS.chrom}\t100\t${TOKENS.id}\tA\tT\t.\tPASS\tDP=notaninteger;AF=0.1,0.2;${TOKENS.infoKey}=${TOKENS.infoValue}\tGT:AD:${TOKENS.formatKey}\t0/1:5:${TOKENS.infoValue}`,
  `${TOKENS.chrom}\t0\t${TOKENS.id}\tA\tT\t.\tPASS\t.\tGT\t0/1`,
  `${TOKENS.chrom}\t200\t${TOKENS.id}\tQQ\tT\t.\tPASS\t.\tGT\t0/1`,
  `${TOKENS.chrom}\t300\t${TOKENS.id}\tA\t<DEL>\t.\tPASS\t.\tGT\t0/1`,
  `${TOKENS.chrom}\t400\t${TOKENS.id}\tA\tT\t.\t${TOKENS.filter}\t.\tGT\t0/1`,
  `${TOKENS.chrom}\t500\t${TOKENS.id}\tA\tT\t.\tPASS\t.\tGT\t./.`,
  `${TOKENS.chrom}\t600\t${TOKENS.id}`
].join('\n');

describe('no part of the input reaches a diagnostic', () => {
  const result = vcfToFhirBundle(HOSTILE_VCF, { timestamp: '2026-07-26T10:00:00Z' });

  it('exercises the paths that report, so the assertion below is not vacuous', () => {
    const reported = Object.keys(result.summary);
    expect(reported).toEqual(
      expect.arrayContaining([
        'fileformat-out-of-scope',
        'header-declaration-invalid',
        'reference-build-unrecognised',
        'record-malformed',
        'record-position-invalid',
        'record-ref-invalid',
        'alt-symbolic-unsupported',
        'record-filtered',
        'info-field-undeclared',
        'info-value-untypable',
        'format-field-undeclared',
        'chromosome-unmapped',
        'genotype-no-call'
      ])
    );
    expect(result.issues?.issue?.length ?? 0).toBeGreaterThan(5);
  });

  it('quotes no chromosome, position, allele, key, sample name or description', () => {
    const diagnostics = JSON.stringify(result.issues);
    for (const [name, token] of Object.entries(TOKENS)) {
      expect(diagnostics, `issue diagnostics leaked the ${name}`).not.toContain(token);
    }
  });

  it('does not put the sample name in the bundle either', () => {
    expect(JSON.stringify(result.bundle)).not.toContain(TOKENS.sample);
  });

  it('holds for the real fixtures as well', () => {
    const hiseq = vcfToFhirBundle(readFixture('hiseq'), { timestamp: '2026-07-26T10:00:00Z' });
    const diagnostics = JSON.stringify(hiseq.issues);
    for (const token of ['NA12878', 'chr1', 'rs11582131', 'HaplotypeScore', 'FDRtranche']) {
      expect(diagnostics).not.toContain(token);
    }
  });
});
