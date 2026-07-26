import { describe, expect, it } from 'vitest';
import { IssueLog } from '../issues';
import { detectGenomeBuild, fileDateToFhirDate } from '../vcf/reference';
import type { VcfContig, VcfHeader } from '../vcf/types';

function header(reference: string[], contigs: VcfContig[] = []): VcfHeader {
  return {
    info: new Map(),
    format: new Map(),
    contigs: new Map(contigs.map((contig) => [contig.id, contig])),
    reference,
    samples: []
  };
}

describe('reference genome build detection', () => {
  it('takes the build from a ##reference line that names one', () => {
    const issues = new IssueLog();
    expect(detectGenomeBuild(header(['GRCh37.3']), issues).coding?.code).toBe('LA14029-5');
    expect(issues.count('reference-build-absent')).toBe(0);
  });

  it('takes the build from a ##contig assembly attribute', () => {
    const issues = new IssueLog();
    expect(detectGenomeBuild(header([], [{ id: '1', assembly: 'b37' }]), issues).coding?.code).toBe('LA14029-5');
  });

  it('ignores a ##reference that is a filesystem path', () => {
    // Real headers carry `##reference=file:///humgen/.../human_g1k_v37.fasta`.
    // Reading a build out of a FASTA filename is a guess, and the path itself has no
    // business in a clinical resource.
    const issues = new IssueLog();
    const build = detectGenomeBuild(
      header(['file:///humgen/gsa-hpprojects/GATK/bundle/current/b37/human_g1k_v37.fasta']),
      issues
    );
    expect(build.coding).toBeUndefined();
    expect(issues.count('reference-build-absent')).toBe(1);
  });

  it('still finds the build when a path line sits beside a build line', () => {
    const issues = new IssueLog();
    const build = detectGenomeBuild(
      header(['GRCh37.3', 'file:///seq/human_g1k_v37.fasta'], [{ id: '1', assembly: 'b37' }]),
      issues
    );
    expect(build.coding?.code).toBe('LA14029-5');
    expect(issues.summary()).toEqual({});
  });

  it('reports the absence of a build rather than assuming one', () => {
    const issues = new IssueLog();
    expect(detectGenomeBuild(header([]), issues).coding).toBeUndefined();
    expect(issues.count('reference-build-absent')).toBe(1);
  });

  it('emits nothing when the header disagrees with itself', () => {
    const issues = new IssueLog();
    const build = detectGenomeBuild(header(['GRCh37'], [{ id: '1', assembly: 'GRCh38' }]), issues);
    expect(build.coding).toBeUndefined();
    expect(issues.count('reference-build-conflict')).toBe(1);
  });

  it('reports a build that is not in the answer list rather than picking the nearest', () => {
    const issues = new IssueLog();
    const build = detectGenomeBuild(header(['T2T-CHM13v2.0']), issues);
    expect(build.coding).toBeUndefined();
    expect(issues.count('reference-build-unrecognised')).toBe(1);
  });
});

describe('##fileDate', () => {
  it('converts the compact form the specification uses', () => {
    expect(fileDateToFhirDate('20111104')).toBe('2011-11-04');
  });

  it('passes through a date that is already ISO', () => {
    expect(fileDateToFhirDate('2011-11-04')).toBe('2011-11-04');
  });

  it('returns nothing for a form it cannot read, rather than a plausible guess', () => {
    expect(fileDateToFhirDate('Nov 4 2011')).toBeUndefined();
    expect(fileDateToFhirDate('04/11/2011')).toBeUndefined();
    expect(fileDateToFhirDate(undefined)).toBeUndefined();
  });
});
