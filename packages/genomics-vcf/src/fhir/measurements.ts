/**
 * WHAT: Declares every Observation and component the VCF connector emits: the Genomics Reporting Variant Observation and each component slice it fills.
 * NOT:  Converts nothing, chooses no codes and asserts no LOINC; variant.ts and terminology.ts own codes, units and values, and this file only describes them.
 * GOVERNED BY: DECISIONS.md#d18; DECISIONS.md#d4
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Coverage is `complete` because every Observation.code and component.code is a constant fixed by an IG slice in terminology.ts. What the VCF supplies — the dbSNP rsID, the chromosome, the assembly — is the component's *value*, never its code, so no input can make this connector emit an undeclared coding.
 */
import {
  declareMeasurement,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  UCUM
} from '@open-twin/fhir-core';
import { CONNECTOR } from '../issues';
import { COMPONENT, VARIANT_ASSESSMENT } from './terminology';

/**
 * A variant call is one sequencing analysis of one sample, so each value is a
 * `reading`: read depth and allelic frequency describe that run, not the person, and
 * a second analysis of the same person is a second reading rather than a duplicate.
 */
const READING = { scope: 'reading' } as const;

const definition = (
  name: string,
  description: string,
  valueType: MeasurementDefinition['valueType'],
  canonicalUnit?: string
): MeasurementDefinition => ({
  key: `${CONNECTOR}:${name}`,
  description,
  valueType,
  ...(canonicalUnit !== undefined ? { canonicalUnit } : {}),
  context: READING
});

const VARIANT = definition(
  'variant',
  'Whether one ALT allele of one VCF record is present in the sample (present, absent, no call or indeterminate), as the Genomics Reporting Variant profile value. Absent with dataAbsentReason when a sites-only VCF names no genotype.',
  'codeable-concept'
);

const CHROMOSOME = definition(
  'variant.chromosome',
  'Chromosome the variant lies on, as a LOINC LL2938-0 answer mapped from the VCF CHROM column.',
  'codeable-concept'
);

const REFERENCE_ASSEMBLY = definition(
  'variant.reference-assembly',
  'Human reference sequence assembly the positions refer to, as declared by the VCF header. Omitted when the file declares no build.',
  'codeable-concept'
);

const REF_ALLELE = definition('variant.ref-allele', 'Reference allele sequence from the VCF REF column.', 'string');

const ALT_ALLELE = definition('variant.alt-allele', 'Alternate allele sequence of the ALT being reported.', 'string');

const COORDINATE_SYSTEM = definition(
  'variant.coordinate-system',
  'Coordinate system the start-end range is expressed in (1-based character counting or 0-based interbase).',
  'codeable-concept'
);

const EXACT_START_END = definition(
  'variant.exact-start-end',
  'Start and end of the reference allele on the reference sequence, as a unitless Range of positions in the declared coordinate system.',
  'range'
);

const ALLELIC_STATE = definition(
  'variant.allelic-state',
  'Zygosity of the ALT allele in the sample (homozygous, heterozygous, hemizygous), from the FORMAT/GT genotype.',
  'codeable-concept'
);

const ALLELIC_READ_DEPTH = definition(
  'variant.allelic-read-depth',
  'Number of sequencing reads supporting this ALT allele in the sample, from FORMAT/AD. A count of reads, not total depth.',
  'quantity',
  UCUM.COUNT.code
);

const SAMPLE_ALLELIC_FREQUENCY = definition(
  'variant.sample-allelic-frequency',
  'Fraction of reads in the sample carrying this ALT allele, from FORMAT/AF, as a number fraction in [0,1]. Never INFO/AF, which is a site or cohort frequency.',
  'quantity',
  UCUM.UNITY.code
);

const VARIATION_CODE = definition(
  'variant.variation-code',
  'A dbSNP rsID the VCF ID column assigns to the variant. Repeats once per rsID.',
  'codeable-concept'
);

/** Each component definition paired with the IG slice code variant.ts writes it under. */
const COMPONENTS = [
  [CHROMOSOME, COMPONENT.CHROMOSOME_IDENTIFIER],
  [REFERENCE_ASSEMBLY, COMPONENT.REFERENCE_SEQUENCE_ASSEMBLY],
  [REF_ALLELE, COMPONENT.REF_ALLELE],
  [ALT_ALLELE, COMPONENT.ALT_ALLELE],
  [COORDINATE_SYSTEM, COMPONENT.COORDINATE_SYSTEM],
  [EXACT_START_END, COMPONENT.EXACT_START_END],
  [ALLELIC_STATE, COMPONENT.ALLELIC_STATE],
  [ALLELIC_READ_DEPTH, COMPONENT.ALLELIC_READ_DEPTH],
  [SAMPLE_ALLELIC_FREQUENCY, COMPONENT.SAMPLE_ALLELIC_FREQUENCY],
  [VARIATION_CODE, COMPONENT.VARIATION_CODE]
] as const;

export const GENOMICS_VCF_MEASUREMENTS: MeasurementDeclarationSet = {
  schemaVersion: MEASUREMENT_SCHEMA_VERSION,
  connector: CONNECTOR,
  version: 1,
  coverage: 'complete',
  definitions: [VARIANT, ...COMPONENTS.map(([owned]) => owned)],
  declarations: [
    declareMeasurement(VARIANT, VARIANT_ASSESSMENT),
    ...COMPONENTS.map(([owned, coding]) => declareMeasurement(owned, coding, VARIANT_ASSESSMENT))
  ]
};
