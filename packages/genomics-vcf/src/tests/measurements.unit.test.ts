import {
  auditMeasurementDeclarations,
  declarationAddress,
  type MeasurementDeclarationSet,
  validateMeasurementDeclarations
} from '@open-twin/fhir-core';
import type { Bundle, Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { vcfToFhirBundle } from '../fhir/bundleBuilder';
import { GENOMICS_VCF_MEASUREMENTS } from '../fhir/measurements';
import { COMPONENT, VARIANT_ASSESSMENT } from '../fhir/terminology';
import { CHROM_LINE_SINGLE_SAMPLE, readFixture } from './helpers';

const TIMESTAMP = '2026-07-26T10:00:00Z';

/**
 * A synthetic single-sample VCF covering what neither committed excerpt does: a
 * declared build, FORMAT/AF (sample allelic frequency), an rsID, a multi-allelic
 * site, and FORMAT/AD and FORMAT/AF elements that are declared but missing (`.`).
 * The positions, alleles and rsIDs are illustrative and describe no person.
 */
const SYNTHETIC_VCF = [
  '##fileformat=VCFv4.2',
  '##reference=GRCh38',
  '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
  '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Allelic depths">',
  '##FORMAT=<ID=AF,Number=A,Type=Float,Description="Allele fraction of the alternate allele">',
  CHROM_LINE_SINGLE_SAMPLE,
  'chr1\t664\trs1000\tC\tG\t50\tPASS\t.\tGT:AD:AF\t0/1:5,2:0.29',
  '2\t10351\t.\tCTA\tC,CA\t50\tPASS\t.\tGT:AD:AF\t1/2:1,2,.:0.4,.',
  'X\t500\t.\tA\tT\t50\tPASS\t.\tGT:AD:AF\t1:0,7:1.0'
].join('\n');

/** Every route through the connector's public entry point that changes what it emits. */
function emittedBundles(): Record<'hiseq' | 'dbsnp' | 'synthetic' | 'interbase', Bundle> {
  return {
    // Real single-sample excerpt: genotype, FORMAT/AD, rsIDs, no build.
    hiseq: vcfToFhirBundle(readFixture('hiseq'), { timestamp: TIMESTAMP, effectiveDateTime: '2026-07-26' }).bundle,
    // Real sites-only excerpt: declared build, no genotype, so no-call with dataAbsentReason.
    dbsnp: vcfToFhirBundle(readFixture('dbsnp'), { timestamp: TIMESTAMP, subject: { reference: 'Patient/example' } })
      .bundle,
    synthetic: vcfToFhirBundle(SYNTHETIC_VCF, { timestamp: TIMESTAMP }).bundle,
    interbase: vcfToFhirBundle(SYNTHETIC_VCF, { timestamp: TIMESTAMP, coordinateSystem: 'zero-based-interbase' }).bundle
  };
}

function observations(bundle: Bundle): Observation[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is Observation => resource?.resourceType === 'Observation');
}

function allObservations(): Observation[] {
  return Object.values(emittedBundles()).flatMap(observations);
}

function without(set: MeasurementDeclarationSet, code: string): MeasurementDeclarationSet {
  return { ...set, declarations: set.declarations.filter((declaration) => declaration.coding.code !== code) };
}

describe('GENOMICS_VCF_MEASUREMENTS', () => {
  it('is internally consistent with the shared definitions', () => {
    expect(validateMeasurementDeclarations(GENOMICS_VCF_MEASUREMENTS)).toEqual([]);
  });

  it('declares the connector this package tags its bundles with', () => {
    const bundle = emittedBundles().hiseq;
    expect(bundle.meta?.tag?.map((tag) => tag.code)).toContain(GENOMICS_VCF_MEASUREMENTS.connector);
    expect(GENOMICS_VCF_MEASUREMENTS.coverage).toBe('complete');
  });

  it('matches every Observation and component the bundle builder emits, and every declaration is exercised', () => {
    const audit = auditMeasurementDeclarations(GENOMICS_VCF_MEASUREMENTS, allObservations());
    expect(audit.issues).toEqual([]);
    expect(audit.unexercised).toEqual([]);
  });

  it('exercises the absent-value paths, not only the present ones', () => {
    const emitted = allObservations();
    // Sites-only VCF: no genotype, so the variant value is absent rather than a guess.
    expect(emitted.some((observation) => observation.dataAbsentReason && !observation.valueCodeableConcept)).toBe(true);
    // `.` in FORMAT/AD is a declared-but-missing element: dataAbsentReason, never 0.
    const components = (code: string) =>
      emitted.flatMap((observation) =>
        (observation.component ?? []).filter((component) =>
          component.code.coding?.some((coding) => coding.code === code)
        )
      );
    const depths = components(COMPONENT.ALLELIC_READ_DEPTH.code);
    expect(depths.some((component) => component.dataAbsentReason && !component.valueQuantity)).toBe(true);
    expect(depths.some((component) => component.valueQuantity?.code === '{count}')).toBe(true);
    // `.` in FORMAT/AF yields no component at all (variant.ts uses optionalNumericComponent).
    const frequencies = components(COMPONENT.SAMPLE_ALLELIC_FREQUENCY.code);
    expect(frequencies.length).toBeGreaterThan(0);
    expect(frequencies.every((component) => component.valueQuantity?.code === '1')).toBe(true);
  });

  it('matches the variant declaration once per emitted Observation', () => {
    const audit = auditMeasurementDeclarations(GENOMICS_VCF_MEASUREMENTS, observations(emittedBundles().hiseq));
    const variant = GENOMICS_VCF_MEASUREMENTS.declarations.find(
      (declaration) => declaration.location.kind === 'observation'
    );
    expect(variant?.coding.code).toBe(VARIANT_ASSESSMENT.code);
    expect(audit.matches.get(declarationAddress(variant as NonNullable<typeof variant>))).toBe(
      observations(emittedBundles().hiseq).length
    );
  });

  it('reports an emitted component whose declaration was removed', () => {
    const audit = auditMeasurementDeclarations(
      without(GENOMICS_VCF_MEASUREMENTS, COMPONENT.ALLELIC_READ_DEPTH.code),
      allObservations()
    );
    expect(audit.issues.length).toBeGreaterThan(0);
    expect(audit.issues.every((issue) => issue.code === 'undeclared' && issue.location === 'component')).toBe(true);
    expect(audit.issues[0]?.codings).toEqual([`http://loinc.org|${COMPONENT.ALLELIC_READ_DEPTH.code}`]);
  });

  it('reports a sample allelic frequency mis-declared as a percentage', () => {
    const misdeclared: MeasurementDeclarationSet = {
      ...GENOMICS_VCF_MEASUREMENTS,
      declarations: GENOMICS_VCF_MEASUREMENTS.declarations.map((declaration) =>
        declaration.coding.code === COMPONENT.SAMPLE_ALLELIC_FREQUENCY.code
          ? { ...declaration, unit: '%' }
          : declaration
      )
    };
    const audit = auditMeasurementDeclarations(misdeclared, allObservations());
    expect(audit.issues.length).toBeGreaterThan(0);
    expect(audit.issues.every((issue) => issue.code === 'unit-mismatch')).toBe(true);
  });

  it('reports a range component mis-declared as a string', () => {
    const misdeclared: MeasurementDeclarationSet = {
      ...GENOMICS_VCF_MEASUREMENTS,
      declarations: GENOMICS_VCF_MEASUREMENTS.declarations.map((declaration) =>
        declaration.coding.code === COMPONENT.EXACT_START_END.code
          ? { ...declaration, valueType: 'string' }
          : declaration
      )
    };
    const audit = auditMeasurementDeclarations(misdeclared, allObservations());
    expect(audit.issues.length).toBe(allObservations().length);
    expect(audit.issues.every((issue) => issue.code === 'value-type-mismatch')).toBe(true);
  });
});
