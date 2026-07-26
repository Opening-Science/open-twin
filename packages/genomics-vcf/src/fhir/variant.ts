import {
  codeableComponent,
  codeableConcept,
  createObservation,
  dataAbsentReason,
  deterministicId,
  numericComponent,
  optionalNumericComponent,
  stringComponent,
  UCUM
} from '@open-twin/fhir-core';
import type { Observation, Reference } from 'fhir/r4';
import { CONNECTOR, type IssueLog } from '../issues';
import { type GenomicCoordinateSystem, genomicRange } from '../vcf/coordinates';
import type { AlleleCall, AllelicState } from '../vcf/genotype';
import type { VcfRecord, VcfScalar } from '../vcf/types';
import {
  ALLELIC_STATE_ANSWER,
  type assemblyCoding,
  COMPONENT,
  COORDINATE_SYSTEM_ANSWER,
  chromosomeCoding,
  DBSNP,
  GENOMICS_REPORTING,
  V2_0074,
  VARIANT_ASSESSMENT,
  VARIANT_PRESENCE
} from './terminology';

type Component = NonNullable<Observation['component']>[number];

export interface VariantMappingInput {
  record: VcfRecord;
  /** VCF allele index of the ALT being mapped: 1 is the first ALT. */
  altIndex: number;
  alt: string;
  subject: Reference;
  /** Hashed into the resource id. Never emitted. */
  subjectKey: string;
  coordinateSystem: GenomicCoordinateSystem;
  assembly?: ReturnType<typeof assemblyCoding>;
  effectiveDateTime?: string;
  call: AlleleCall;
  /** FORMAT values for the selected sample, if the file has one. */
  formatValues?: Map<string, VcfScalar[]>;
  issues: IssueLog;
}

const ALLELIC_STATE_CODING: Record<AllelicState, (typeof ALLELIC_STATE_ANSWER)[keyof typeof ALLELIC_STATE_ANSWER]> = {
  homozygous: ALLELIC_STATE_ANSWER.HOMOZYGOUS,
  heterozygous: ALLELIC_STATE_ANSWER.HETEROZYGOUS,
  hemizygous: ALLELIC_STATE_ANSWER.HEMIZYGOUS
};

const RSID = /^rs\d+$/;

/**
 * A Range component. `@open-twin/fhir-core` has no Range helper — `quantity()` builds
 * a UCUM Quantity, and these endpoints are positions on a reference sequence, which
 * have no unit at all. Attaching one would be wrong, not merely redundant.
 */
function rangeComponent(coding: (typeof COMPONENT)['EXACT_START_END'], low: number, high: number): Component {
  return { code: codeableConcept(coding), valueRange: { low: { value: low }, high: { value: high } } };
}

function numericAt(values: VcfScalar[] | undefined, index: number): number | null | undefined {
  if (!values) return undefined;
  const value = values[index];
  if (value === undefined) return undefined;
  return typeof value === 'number' ? value : null;
}

function presenceValue(call: AlleleCall) {
  switch (call.presence) {
    case 'present':
      return VARIANT_PRESENCE.PRESENT;
    case 'absent':
      return VARIANT_PRESENCE.ABSENT;
    case 'no-call':
      return VARIANT_PRESENCE.NO_CALL;
    case 'indeterminate':
      return VARIANT_PRESENCE.INDETERMINATE;
  }
}

/**
 * One ALT allele of one VCF record, for one subject, as one Observation conforming
 * to the Genomics Reporting Variant profile.
 *
 * Multi-allelic sites produce one of these per ALT. They deliberately share nothing
 * but their coordinates: each carries its own alt-allele string and its own allelic
 * state, because `1/2` is heterozygous for two different variants and collapsing that
 * into one resource loses which allele is which.
 */
export function mapVariantToObservation(input: VariantMappingInput): Observation {
  const { record, altIndex, alt, issues } = input;

  const chromosome = chromosomeCoding(record.chrom);
  if (!chromosome) issues.add('chromosome-unmapped');

  const range = genomicRange(input.coordinateSystem, record.pos, record.ref.length);
  const coordinateSystemCoding =
    input.coordinateSystem === 'one-based-character'
      ? COORDINATE_SYSTEM_ANSWER.ONE_BASED_CHARACTER
      : COORDINATE_SYSTEM_ANSWER.ZERO_BASED_INTERBASE;

  const allelicDepth = numericAt(input.formatValues?.get('AD'), altIndex);
  const sampleFrequency = numericAt(input.formatValues?.get('AF'), altIndex - 1);

  const components: Array<Component | undefined> = [
    chromosome ? codeableComponent(COMPONENT.CHROMOSOME_IDENTIFIER, chromosome) : undefined,
    input.assembly ? codeableComponent(COMPONENT.REFERENCE_SEQUENCE_ASSEMBLY, input.assembly) : undefined,
    stringComponent(COMPONENT.REF_ALLELE, record.ref),
    stringComponent(COMPONENT.ALT_ALLELE, alt),
    codeableComponent(COMPONENT.COORDINATE_SYSTEM, coordinateSystemCoding),
    rangeComponent(COMPONENT.EXACT_START_END, range.low, range.high),
    input.call.allelicState
      ? codeableComponent(COMPONENT.ALLELIC_STATE, ALLELIC_STATE_CODING[input.call.allelicState])
      : undefined,
    // FORMAT/AD is per-allele (Number=R). A declared-but-missing element yields a
    // dataAbsentReason; an absent AD key yields no component at all. Zero reads and
    // "the caller did not report read depth" are different facts.
    allelicDepth === undefined ? undefined : numericComponent(COMPONENT.ALLELIC_READ_DEPTH, allelicDepth, UCUM.COUNT),
    // LOINC 81258-6 has property NFr — a number fraction, so UCUM `1` and a value in
    // [0,1], never a percentage. Only FORMAT/AF is used: INFO/AF is a site- or
    // cohort-level frequency in most callers, and publishing it under a code whose
    // name begins "Sample variant" is the same class of defect as a wrong unit.
    sampleFrequency === undefined
      ? undefined
      : optionalNumericComponent(COMPONENT.SAMPLE_ALLELIC_FREQUENCY, sampleFrequency, UCUM.UNITY),
    ...record.ids
      .filter((id) => RSID.test(id))
      .map((id) => codeableComponent(COMPONENT.VARIATION_CODE, { system: DBSNP, code: id }))
  ];

  const observation = createObservation({
    id: deterministicId({
      connector: CONNECTOR,
      subjectKey: input.subjectKey,
      recordId: `${record.chrom}|${record.pos}|${record.ref}|${record.alts.join(',')}`,
      measure: `alt-${altIndex}`
    }),
    code: VARIANT_ASSESSMENT,
    category: { code: 'laboratory', display: 'Laboratory' },
    subject: input.subject,
    ...(input.effectiveDateTime ? { effectiveDateTime: input.effectiveDateTime } : {}),
    ...(input.call.presence === 'no-call' && input.formatValues === undefined
      ? { dataAbsentReason: dataAbsentReason('unknown') }
      : { valueCodeableConcept: codeableConcept(presenceValue(input.call)) }),
    components,
    profiles: [GENOMICS_REPORTING.VARIANT_PROFILE]
  });

  // genomic-base slices Observation.category into a `laboratory` slice and a `GE`
  // slice from HL7 v2 table 0074. `createObservation` fixes the category system to
  // observation-category, so the second slice is appended here rather than by
  // reimplementing the helper.
  observation.category = [
    ...(observation.category ?? []),
    { coding: [{ system: V2_0074, code: 'GE', display: 'Genetics' }] }
  ];

  return observation;
}
