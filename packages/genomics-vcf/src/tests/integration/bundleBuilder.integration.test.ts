import { ConnectorError } from '@open-twin/fhir-core';
import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { vcfToFhirBundle } from '../../fhir/bundleBuilder';
import { CHROM_LINE_SINGLE_SAMPLE, readFixture } from '../helpers';

const TIMESTAMP = '2026-07-26T10:00:00Z';

function observations(bundle: { entry?: Array<{ resource?: { resourceType: string } }> }): Observation[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is Observation => resource?.resourceType === 'Observation');
}

function component(observation: Observation, code: string) {
  return observation.component?.find((entry) => entry.code.coding?.some((coding) => coding.code === code));
}

describe('HiSeq NA12878 excerpt (a real single-sample VCF with no reference declared)', () => {
  const result = vcfToFhirBundle(readFixture('hiseq'), { timestamp: TIMESTAMP, effectiveDateTime: '2026-07-26' });

  it('maps every PASS record and excludes every filtered one', () => {
    // 11 committed records: 7 PASS, 4 carrying a non-PASS FILTER.
    expect(result.variantCount).toBe(7);
    expect(result.summary['record-filtered']).toBe(4);
  });

  it('reports the missing reference genome build instead of inferring hg18 from the command line', () => {
    // The file's ##UnifiedGenotyper line names Homo_sapiens_assembly18. It is not a
    // declaration of the build and this connector does not read it.
    expect(result.summary['reference-build-absent']).toBe(1);
    expect(result.issues?.issue?.some((issue) => issue.diagnostics?.includes('reference genome build'))).toBe(true);
    for (const observation of observations(result.bundle)) {
      expect(component(observation, '62374-4')).toBeUndefined();
    }
  });

  it('reads a homozygous PASS call with its read depth', () => {
    // chr1 664 . C G 30.66 PASS ... GT:AD:DP:GL:GQ 1/1:0,2:2:...
    const observation = observations(result.bundle).find(
      (candidate) => component(candidate, '81254-5')?.valueRange?.low?.value === 664
    );
    expect(component(observation as Observation, '69547-8')?.valueString).toBe('C');
    expect(component(observation as Observation, '69551-0')?.valueString).toBe('G');
    expect(component(observation as Observation, '53034-5')?.valueCodeableConcept?.coding?.[0]?.code).toBe('LA6705-3');
    expect(component(observation as Observation, '82121-5')?.valueQuantity?.value).toBe(2);
    expect((observation as Observation).valueCodeableConcept?.coding?.[0]?.code).toBe('LA9633-4');
  });

  it('emits a Patient the subject reference resolves to, carrying nothing about the person', () => {
    const patientEntry = result.bundle.entry?.find((entry) => entry.resource?.resourceType === 'Patient');
    expect(patientEntry).toBeDefined();
    expect(Object.keys(patientEntry?.resource ?? {})).toEqual(['resourceType', 'id']);
    for (const observation of observations(result.bundle)) {
      expect(observation.subject?.reference).toBe(patientEntry?.fullUrl);
    }
  });

  it('never publishes the sample column name', () => {
    // The sample name is chosen by whoever ran the sequencer and can be a person's
    // name. It is hashed into the resource ids and appears nowhere else.
    expect(JSON.stringify(result.bundle)).not.toContain('NA12878');
  });

  it('produces byte-identical output for the same input', () => {
    const again = vcfToFhirBundle(readFixture('hiseq'), { timestamp: TIMESTAMP, effectiveDateTime: '2026-07-26' });
    expect(JSON.stringify(again.bundle)).toBe(JSON.stringify(result.bundle));
  });
});

describe('dbSNP 135 b37 excerpt (a real sites-only VCF that declares its build)', () => {
  const subject = { reference: 'Patient/example' };
  const result = vcfToFhirBundle(readFixture('dbsnp'), { timestamp: TIMESTAMP, subject });

  it('refuses to invent a subject for a file that names no individual', () => {
    expect(() => vcfToFhirBundle(readFixture('dbsnp'), { timestamp: TIMESTAMP })).toThrow(ConnectorError);
  });

  it('uses the caller-supplied subject verbatim and adds no Patient', () => {
    expect(result.bundle.entry?.some((entry) => entry.resource?.resourceType === 'Patient')).toBe(false);
    for (const observation of observations(result.bundle)) {
      expect(observation.subject).toEqual(subject);
    }
  });

  it('expands multi-allelic sites into one Observation per ALT', () => {
    // 10 committed records, three of which carry two ALTs.
    expect(result.variantCount).toBe(13);
    const atTheIndel = observations(result.bundle).filter(
      (observation) => component(observation, '81254-5')?.valueRange?.low?.value === 10_351
    );
    expect(atTheIndel.map((observation) => component(observation, '69551-0')?.valueString)).toEqual(['C', 'CA']);
    expect(new Set(atTheIndel.map((observation) => observation.id)).size).toBe(2);
  });

  it('reads GRCh37 from the header rather than from the FASTA path beside it', () => {
    for (const observation of observations(result.bundle)) {
      expect(component(observation, '62374-4')?.valueCodeableConcept?.coding?.[0]?.code).toBe('LA14029-5');
    }
    expect(result.summary['reference-build-absent']).toBeUndefined();
    expect(result.summary['reference-build-conflict']).toBeUndefined();
  });

  it('takes the effective date from ##fileDate', () => {
    for (const observation of observations(result.bundle)) {
      expect(observation.effectiveDateTime).toBe('2011-11-04');
    }
  });

  it('says the presence of each variant is unknown, because a sites-only file cannot say', () => {
    for (const observation of observations(result.bundle)) {
      expect(observation.valueCodeableConcept).toBeUndefined();
      expect(observation.dataAbsentReason?.coding?.[0]?.code).toBe('unknown');
      expect(component(observation, '53034-5')).toBeUndefined();
    }
  });

  it('reports no parsing problems at all for a well-formed file', () => {
    expect(result.summary).toEqual({});
    expect(result.issues).toBeUndefined();
  });
});

describe('constructs that are out of scope', () => {
  const declarations = [
    '##fileformat=VCFv4.2',
    '##INFO=<ID=END,Number=1,Type=Integer,Description="Stop position of the interval">',
    '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">'
  ];

  function convert(dataLines: string[]) {
    return vcfToFhirBundle([...declarations, CHROM_LINE_SINGLE_SAMPLE, ...dataLines].join('\n'), {
      timestamp: TIMESTAMP
    });
  }

  it('skips a symbolic ALT and says which kind it was', () => {
    const result = convert(['chr1\t100\t.\tA\t<DEL>\t.\tPASS\t.\tGT\t0/1']);
    expect(result.variantCount).toBe(0);
    expect(result.summary['alt-symbolic-unsupported']).toBe(1);
  });

  it('skips a breakend', () => {
    const result = convert(['chr1\t100\t.\tA\tA[chr2:321682[\t.\tPASS\t.\tGT\t0/1']);
    expect(result.variantCount).toBe(0);
    expect(result.summary['alt-breakend-unsupported']).toBe(1);
  });

  it('skips a gVCF reference block', () => {
    const result = convert(['chr1\t100\t.\tA\t<NON_REF>\t.\tPASS\tEND=200\tGT\t0/0']);
    expect(result.variantCount).toBe(0);
    expect(result.summary['gvcf-reference-block-skipped']).toBe(1);
  });

  it('skips a spanning deletion but keeps the real ALT beside it', () => {
    const result = convert(['chr1\t100\t.\tA\tT,*\t.\tPASS\t.\tGT\t1/2']);
    expect(result.variantCount).toBe(1);
    expect(result.summary['alt-spanning-deletion-skipped']).toBe(1);
  });

  it('refuses a joint call unless the caller says which sample the bundle is about', () => {
    const joint = [
      '##fileformat=VCFv4.2',
      '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
      '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1\tS2',
      'chr1\t100\t.\tA\tT\t.\tPASS\t.\tGT\t0/1\t1/1'
    ].join('\n');

    expect(() => vcfToFhirBundle(joint, { timestamp: TIMESTAMP })).toThrow(ConnectorError);
    expect(() => vcfToFhirBundle(joint, { timestamp: TIMESTAMP, sampleId: 'S3' })).toThrow(ConnectorError);

    const forS2 = vcfToFhirBundle(joint, { timestamp: TIMESTAMP, sampleId: 'S2' });
    expect(forS2.variantCount).toBe(1);
    const state = observations(forS2.bundle)[0];
    expect(component(state as Observation, '53034-5')?.valueCodeableConcept?.coding?.[0]?.code).toBe('LA6705-3');
  });

  it('refuses a file with no #CHROM line', () => {
    expect(() => vcfToFhirBundle('##fileformat=VCFv4.2\n', { timestamp: TIMESTAMP })).toThrow(ConnectorError);
  });
});
