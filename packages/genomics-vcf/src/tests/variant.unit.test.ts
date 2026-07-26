import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { GENOMICS_REPORTING, V2_0074 } from '../fhir/terminology';
import { mapVariantToObservation, type VariantMappingInput } from '../fhir/variant';
import { IssueLog } from '../issues';
import { callForAlt } from '../vcf/genotype';
import { parseGenotype } from '../vcf/records';
import type { VcfRecord } from '../vcf/types';
import { CHROM_LINE_SINGLE_SAMPLE, parseVcf } from './helpers';

const DECLARATIONS = [
  '##fileformat=VCFv4.2',
  '##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">',
  '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
  '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Allelic depths">',
  '##FORMAT=<ID=AF,Number=A,Type=Float,Description="Allele fraction of the alternate allele">'
];

function firstRecord(dataLine: string): VcfRecord {
  const { records } = parseVcf([...DECLARATIONS, CHROM_LINE_SINGLE_SAMPLE, dataLine]);
  const record = records[0];
  if (!record) throw new Error('test fixture did not parse');
  return record;
}

function mapAlt(dataLine: string, altIndex: number, overrides: Partial<VariantMappingInput> = {}): Observation {
  const record = firstRecord(dataLine);
  const formatValues = record.samples.get('S1');
  const genotypeRaw = formatValues?.get('GT')?.[0];
  const genotype = typeof genotypeRaw === 'string' ? parseGenotype(genotypeRaw) : undefined;
  const alt = record.alts[altIndex - 1];
  if (alt === undefined) throw new Error('test fixture has no such ALT');

  return mapVariantToObservation({
    record,
    altIndex,
    alt,
    subject: { reference: 'Patient/example' },
    subjectKey: 'S1',
    coordinateSystem: 'one-based-character',
    call: callForAlt(genotype, altIndex),
    ...(formatValues ? { formatValues } : {}),
    issues: new IssueLog(),
    ...overrides
  });
}

function component(observation: Observation, code: string) {
  return observation.component?.find((entry) => entry.code.coding?.some((coding) => coding.code === code));
}

describe('the variant Observation', () => {
  it('declares the Genomics Reporting Variant profile and both required categories', () => {
    const observation = mapAlt('chr1\t664\t.\tC\tG\t30\tPASS\tAF=0.5\tGT:AD\t1/1:0,2', 1);
    expect(observation.meta?.profile).toEqual([GENOMICS_REPORTING.VARIANT_PROFILE]);

    const systems = observation.category?.flatMap((category) => category.coding?.map((coding) => coding.system) ?? []);
    expect(systems).toContain('http://terminology.hl7.org/CodeSystem/observation-category');
    expect(systems).toContain(V2_0074);
  });

  it('carries REF and ALT verbatim, including the VCF padding base of an indel', () => {
    const observation = mapAlt('1\t10351\t.\tCTA\tC,CA\t.\tPASS\tAF=0.1,0.2\tGT:AD\t1/2:1,2,3', 1);
    expect(component(observation, '69547-8')?.valueString).toBe('CTA');
    expect(component(observation, '69551-0')?.valueString).toBe('C');
    expect(component(observation, '81254-5')?.valueRange).toEqual({ low: { value: 10_351 }, high: { value: 10_353 } });
  });

  it('states which coordinate system the range is in, and honours the one requested', () => {
    const oneBased = mapAlt('chr1\t664\t.\tC\tG\t.\tPASS\t.\tGT:AD\t0/1:5,2', 1);
    expect(component(oneBased, '92822-6')?.valueCodeableConcept?.coding?.[0]?.code).toBe('LA30102-0');
    expect(component(oneBased, '81254-5')?.valueRange?.low?.value).toBe(664);

    const interbase = mapAlt('chr1\t664\t.\tC\tG\t.\tPASS\t.\tGT:AD\t0/1:5,2', 1, {
      coordinateSystem: 'zero-based-interbase'
    });
    expect(component(interbase, '92822-6')?.valueCodeableConcept?.coding?.[0]?.code).toBe('LA30100-4');
    expect(component(interbase, '81254-5')?.valueRange?.low?.value).toBe(663);
  });

  it('reads the allelic read depth of the ALT being mapped, not of the reference', () => {
    // AD is Number=R: [ref, alt1, alt2]. Taking element 0 gives the reference depth
    // under a code that says "allelic read depth", which reads as a real number and
    // is the wrong one.
    const alt1 = mapAlt('1\t10351\t.\tCTA\tC,CA\t.\tPASS\t.\tGT:AD\t1/2:11,22,33', 1);
    const alt2 = mapAlt('1\t10351\t.\tCTA\tC,CA\t.\tPASS\t.\tGT:AD\t1/2:11,22,33', 2);
    expect(component(alt1, '82121-5')?.valueQuantity?.value).toBe(22);
    expect(component(alt2, '82121-5')?.valueQuantity?.value).toBe(33);
  });

  it('emits a data-absent-reason, not a zero, when the read depth element is missing', () => {
    const observation = mapAlt('chr1\t664\t.\tC\tG\t.\tPASS\t.\tGT:AD\t0/1:5,.', 1);
    const depth = component(observation, '82121-5');
    expect(depth?.valueQuantity).toBeUndefined();
    expect(depth?.dataAbsentReason?.coding?.[0]?.code).toBe('unknown');
  });

  it('omits the read depth component entirely when the file reports no AD', () => {
    const observation = mapAlt('chr1\t664\t.\tC\tG\t.\tPASS\t.\tGT\t0/1', 1);
    expect(component(observation, '82121-5')).toBeUndefined();
  });

  it('takes sample allelic frequency from FORMAT/AF as a fraction of one', () => {
    const observation = mapAlt('chr1\t664\t.\tC\tG\t.\tPASS\t.\tGT:AD:AF\t0/1:5,2:0.29', 1);
    expect(component(observation, '81258-6')?.valueQuantity).toEqual({
      value: 0.29,
      unit: '1',
      system: 'http://unitsofmeasure.org',
      code: '1'
    });
  });

  it('never takes sample allelic frequency from INFO/AF', () => {
    // LOINC 81258-6 is "Sample variant allelic frequency". INFO/AF is a site- or
    // cohort-level frequency in most callers; publishing it under that code is the
    // same class of defect as sending radians under a code that says degrees.
    const observation = mapAlt('chr1\t664\t.\tC\tG\t.\tPASS\tAF=0.50\tGT:AD\t0/1:5,2', 1);
    expect(component(observation, '81258-6')).toBeUndefined();
  });

  it('carries an rsID as a variation code and ignores anything that is not one', () => {
    const withRsid = mapAlt('chr1\t4536\trs11582131\tG\tC\t.\tPASS\t.\tGT:AD\t0/1:5,2', 1);
    expect(component(withRsid, '81252-9')?.valueCodeableConcept?.coding?.[0]).toEqual({
      system: 'http://www.ncbi.nlm.nih.gov/projects/SNP',
      code: 'rs11582131'
    });

    const localId = mapAlt('chr1\t4536\tmy-internal-id\tG\tC\t.\tPASS\t.\tGT:AD\t0/1:5,2', 1);
    expect(component(localId, '81252-9')).toBeUndefined();
  });

  it('gives each ALT of a multi-allelic site its own resource id', () => {
    const line = '1\t10351\t.\tCTA\tC,CA\t.\tPASS\t.\tGT:AD\t1/2:1,2,3';
    expect(mapAlt(line, 1).id).not.toBe(mapAlt(line, 2).id);
  });

  it('gives the same input the same resource id, so a re-run does not duplicate', () => {
    const line = 'chr1\t664\t.\tC\tG\t.\tPASS\t.\tGT:AD\t1/1:0,2';
    expect(mapAlt(line, 1).id).toBe(mapAlt(line, 1).id);
  });

  it('reports a chromosome it cannot map rather than emitting a component', () => {
    const issues = new IssueLog();
    const observation = mapAlt('chrM\t664\t.\tC\tG\t.\tPASS\t.\tGT:AD\t1/1:0,2', 1, { issues });
    expect(component(observation, '48000-4')).toBeUndefined();
    expect(issues.count('chromosome-unmapped')).toBe(1);
  });
});
