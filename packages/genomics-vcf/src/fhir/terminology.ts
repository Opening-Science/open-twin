/**
 * WHAT: LOINC and answer codings for Genomics Reporting variant Observations.
 * NOT:  Must not invent codes; every LOINC/SNOMED used must be allowlisted.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: signed review record (verify/terminology-allowlist.json).
 */
import { SYSTEMS } from '@open-twin/fhir-core';

/**
 * Every code in this file was looked up individually, and the display strings are
 * the ones the code system itself returns — not the ones the implementation guide's
 * prose happens to use.
 *
 * Method, so it can be repeated rather than trusted:
 *
 *   LOINC concepts   GET https://tx.fhir.org/r4/CodeSystem/$lookup
 *                        ?system=http://loinc.org&code=<code>
 *   LOINC answers    GET https://tx.fhir.org/r4/ValueSet/$expand
 *                        ?url=http://loinc.org/vs/<answer list>
 *
 * tx.fhir.org is HL7's own terminology server and reported LOINC version 2.82. Run
 * on 2026-07-26. `92822-6` is the example of why this matters: the IG renders it as
 * "Coordinate System", LOINC's own display is "Genomic coordinate system [Type]",
 * and a reviewer checking the former against a LOINC browser would find nothing.
 *
 * Separately, each component code below is the one the IG *fixes* for that slice —
 * read out of the StructureDefinition, not out of the rendered table:
 *
 *   http://hl7.org/fhir/uv/genomics-reporting/STU3/StructureDefinition-variant.json
 *   http://hl7.org/fhir/uv/genomics-reporting/STU3/StructureDefinition-finding.json
 *   http://hl7.org/fhir/uv/genomics-reporting/STU3/StructureDefinition-genomic-base.json
 *
 * Anything that could not be verified twice this way is absent from this file and
 * listed under "Not emitted" in the README, rather than guessed at.
 *
 * Every coding is written as a literal object with a literal `code`, rather than
 * built by a helper. That is deliberate: `verify/check-terminology.mjs` finds codes
 * by looking for a string `code` sitting beside a `system`, and skips anything
 * assembled dynamically. A factory function would hide these codes from the gate
 * whose entire purpose is to make using a code cost a lookup.
 */

export const GENOMICS_REPORTING = {
  /** Profile canonical of the Variant profile, version 3.0.0 (STU3). */
  VARIANT_PROFILE: 'http://hl7.org/fhir/uv/genomics-reporting/StructureDefinition/variant'
} as const;

/**
 * `Observation.category` on the IG's genomic-base profile is 2..*, sliced into a
 * `laboratory` slice and a `GE` slice. The `GE` code lives in the HL7 v2 table 0074
 * code system, which `SYSTEMS` in @open-twin/fhir-core does not yet carry; it is a
 * standard HL7 system, not an invented one.
 */
export const V2_0074 = 'http://terminology.hl7.org/CodeSystem/v2-0074';

/**
 * dbSNP, as the ID column of a VCF supplies it. The URI is the one the FHIR R4
 * specification itself registers for dbSNP in "Using Codes in resources"
 * (http://hl7.org/fhir/R4/terminologies-systems.html), not one invented here.
 */
export const DBSNP = 'http://www.ncbi.nlm.nih.gov/projects/SNP';

export interface LoincCoding {
  system: typeof SYSTEMS.LOINC;
  code: string;
  display: string;
}

/** Observation.code of the Variant profile. */
export const VARIANT_ASSESSMENT: LoincCoding = {
  system: SYSTEMS.LOINC,
  code: '69548-6',
  display: 'Genetic variant assessment'
};

/** Component codes, each fixed by the profile slice named in the comment. */
export const COMPONENT = {
  /** variant#ref-allele */
  REF_ALLELE: { system: SYSTEMS.LOINC, code: '69547-8', display: 'Genomic ref allele [ID]' },
  /** variant#alt-allele */
  ALT_ALLELE: { system: SYSTEMS.LOINC, code: '69551-0', display: 'Genomic alt allele [ID]' },
  /** variant#exact-start-end, valued as a Range */
  EXACT_START_END: { system: SYSTEMS.LOINC, code: '81254-5', display: 'Genomic allele start-end' },
  /** variant#coordinate-system, bound (extensible) to LL5323-2 */
  COORDINATE_SYSTEM: { system: SYSTEMS.LOINC, code: '92822-6', display: 'Genomic coordinate system [Type]' },
  /** variant#allelic-state, bound (extensible) to LL381-5 */
  ALLELIC_STATE: { system: SYSTEMS.LOINC, code: '53034-5', display: 'Allelic state' },
  /** variant#allelic-read-depth, valued as a Quantity */
  ALLELIC_READ_DEPTH: { system: SYSTEMS.LOINC, code: '82121-5', display: 'Allelic read depth' },
  /** variant#sample-allelic-frequency. NFr: a fraction of one, not a percent. */
  SAMPLE_ALLELIC_FREQUENCY: {
    system: SYSTEMS.LOINC,
    code: '81258-6',
    display: 'Sample variant allelic frequency [NFr]'
  },
  /** variant#variation-code, 0..* */
  VARIATION_CODE: { system: SYSTEMS.LOINC, code: '81252-9', display: 'Discrete genetic variant' },
  /** finding#reference-sequence-assembly, bound (extensible) to LL1040-6 */
  REFERENCE_SEQUENCE_ASSEMBLY: {
    system: SYSTEMS.LOINC,
    code: '62374-4',
    display: 'Human reference sequence assembly version'
  },
  /** finding#chromosome-identifier, bound (required) to LL2938-0 */
  CHROMOSOME_IDENTIFIER: {
    system: SYSTEMS.LOINC,
    code: '48000-4',
    display: 'Chromosome [Identifier] in Blood or Tissue by Molecular genetics method'
  }
} as const;

/**
 * Observation.value[x] of the Variant profile, bound (required) to LL1971-2.
 * Expanded 2026-07-26: LA9633-4, LA9634-2, LA18198-4, LA11884-6.
 */
export const VARIANT_PRESENCE = {
  PRESENT: { system: SYSTEMS.LOINC, code: 'LA9633-4', display: 'Present' },
  ABSENT: { system: SYSTEMS.LOINC, code: 'LA9634-2', display: 'Absent' },
  NO_CALL: { system: SYSTEMS.LOINC, code: 'LA18198-4', display: 'No call' },
  INDETERMINATE: { system: SYSTEMS.LOINC, code: 'LA11884-6', display: 'Indeterminate' }
} as const;

/** LL5323-2, expanded 2026-07-26. */
export const COORDINATE_SYSTEM_ANSWER = {
  ZERO_BASED_INTERBASE: { system: SYSTEMS.LOINC, code: 'LA30100-4', display: '0-based interval counting' },
  ONE_BASED_CHARACTER: { system: SYSTEMS.LOINC, code: 'LA30102-0', display: '1-based character counting' }
} as const;

/** LL381-5, expanded 2026-07-26. Heteroplasmic/homoplasmic are not derivable from a VCF. */
export const ALLELIC_STATE_ANSWER = {
  HOMOZYGOUS: { system: SYSTEMS.LOINC, code: 'LA6705-3', display: 'Homozygous' },
  HETEROZYGOUS: { system: SYSTEMS.LOINC, code: 'LA6706-1', display: 'Heterozygous' },
  HEMIZYGOUS: { system: SYSTEMS.LOINC, code: 'LA6707-9', display: 'Hemizygous' }
} as const;

/**
 * LL1040-6, expanded 2026-07-26. Note LA14029-5, not LA14029-2 — the check digit is
 * part of the code and an adjacent-looking guess is a different concept.
 */
const ASSEMBLY_ANSWER = {
  GRCH38: { system: SYSTEMS.LOINC, code: 'LA26806-2', display: 'GRCh38' },
  GRCH37: { system: SYSTEMS.LOINC, code: 'LA14029-5', display: 'GRCh37' },
  NCBI36: { system: SYSTEMS.LOINC, code: 'LA14030-3', display: 'NCBI Build 36.1' },
  NCBI35: { system: SYSTEMS.LOINC, code: 'LA14031-1', display: 'NCBI Build 35' },
  NCBI34: { system: SYSTEMS.LOINC, code: 'LA14032-9', display: 'NCBI Build 34' }
} as const;

/**
 * Header strings that name a build, mapped to LL1040-6. Normalisation strips `_`,
 * `.`, `-` and whitespace and uppercases first, so the patterns are written against
 * the stripped form: `human_g1k_v37` becomes `HUMANG1KV37`.
 *
 * The UCSC `hg` names are aliases the community treats as equivalent to the GRC
 * names, and the equivalence is not exact — hg19 and GRCh37 differ in the
 * mitochondrial sequence and in contig naming, and hg38 carries UCSC-specific alt
 * contigs. Nothing in this connector depends on that difference, because it emits
 * only the assembly *code* and never converts a coordinate between builds. It is
 * still an assertion a reviewer should confirm.
 *
 * TODO(clinical-review): confirm that reporting hg19 as GRCh37 and hg38 as GRCh38 is
 * acceptable for the receiving systems, or require the GRC name explicitly.
 */
const BUILD_ALIASES: ReadonlyArray<readonly [RegExp, LoincCoding]> = [
  [/^GRCH38/, ASSEMBLY_ANSWER.GRCH38],
  [/^HG38/, ASSEMBLY_ANSWER.GRCH38],
  [/^GRCH37/, ASSEMBLY_ANSWER.GRCH37],
  [/^HG19/, ASSEMBLY_ANSWER.GRCH37],
  [/^B37$/, ASSEMBLY_ANSWER.GRCH37],
  [/^HUMANG1KV37/, ASSEMBLY_ANSWER.GRCH37],
  [/^(NCBI)?(BUILD)?36/, ASSEMBLY_ANSWER.NCBI36],
  [/^HG18/, ASSEMBLY_ANSWER.NCBI36],
  [/^B36$/, ASSEMBLY_ANSWER.NCBI36],
  [/^(NCBI)?(BUILD)?35/, ASSEMBLY_ANSWER.NCBI35],
  [/^HG17/, ASSEMBLY_ANSWER.NCBI35],
  [/^(NCBI)?(BUILD)?34/, ASSEMBLY_ANSWER.NCBI34],
  [/^HG16/, ASSEMBLY_ANSWER.NCBI34]
];

/** Undefined when nothing in LL1040-6 matches. The build is never assumed. */
export function assemblyCoding(declaredBuild: string): LoincCoding | undefined {
  const normalised = declaredBuild
    .trim()
    .toUpperCase()
    .replace(/[\s._-]/g, '');
  for (const [pattern, coding] of BUILD_ALIASES) {
    if (pattern.test(normalised)) return coding;
  }
  return undefined;
}

/**
 * LL2938-0, expanded 2026-07-26: chromosomes 1-22, X and Y, and nothing else.
 *
 * Written out rather than generated. The codes are not contiguous once the check
 * digit is included, so a loop would have to carry the same 24 literals anyway, and
 * a table a reviewer can read straight down is the point.
 *
 * The mitochondrion has no member of this answer list, so `chrM` / `MT` yields no
 * chromosome component rather than an invented code.
 */
const CHROMOSOME_ANSWERS: ReadonlyMap<string, LoincCoding> = new Map<string, LoincCoding>([
  ['1', { system: SYSTEMS.LOINC, code: 'LA21254-0', display: 'Chromosome 1' }],
  ['2', { system: SYSTEMS.LOINC, code: 'LA21255-7', display: 'Chromosome 2' }],
  ['3', { system: SYSTEMS.LOINC, code: 'LA21256-5', display: 'Chromosome 3' }],
  ['4', { system: SYSTEMS.LOINC, code: 'LA21257-3', display: 'Chromosome 4' }],
  ['5', { system: SYSTEMS.LOINC, code: 'LA21258-1', display: 'Chromosome 5' }],
  ['6', { system: SYSTEMS.LOINC, code: 'LA21259-9', display: 'Chromosome 6' }],
  ['7', { system: SYSTEMS.LOINC, code: 'LA21260-7', display: 'Chromosome 7' }],
  ['8', { system: SYSTEMS.LOINC, code: 'LA21261-5', display: 'Chromosome 8' }],
  ['9', { system: SYSTEMS.LOINC, code: 'LA21262-3', display: 'Chromosome 9' }],
  ['10', { system: SYSTEMS.LOINC, code: 'LA21263-1', display: 'Chromosome 10' }],
  ['11', { system: SYSTEMS.LOINC, code: 'LA21264-9', display: 'Chromosome 11' }],
  ['12', { system: SYSTEMS.LOINC, code: 'LA21265-6', display: 'Chromosome 12' }],
  ['13', { system: SYSTEMS.LOINC, code: 'LA21266-4', display: 'Chromosome 13' }],
  ['14', { system: SYSTEMS.LOINC, code: 'LA21267-2', display: 'Chromosome 14' }],
  ['15', { system: SYSTEMS.LOINC, code: 'LA21268-0', display: 'Chromosome 15' }],
  ['16', { system: SYSTEMS.LOINC, code: 'LA21269-8', display: 'Chromosome 16' }],
  ['17', { system: SYSTEMS.LOINC, code: 'LA21270-6', display: 'Chromosome 17' }],
  ['18', { system: SYSTEMS.LOINC, code: 'LA21271-4', display: 'Chromosome 18' }],
  ['19', { system: SYSTEMS.LOINC, code: 'LA21272-2', display: 'Chromosome 19' }],
  ['20', { system: SYSTEMS.LOINC, code: 'LA21273-0', display: 'Chromosome 20' }],
  ['21', { system: SYSTEMS.LOINC, code: 'LA21274-8', display: 'Chromosome 21' }],
  ['22', { system: SYSTEMS.LOINC, code: 'LA21275-5', display: 'Chromosome 22' }],
  ['X', { system: SYSTEMS.LOINC, code: 'LA21276-3', display: 'Chromosome X' }],
  ['Y', { system: SYSTEMS.LOINC, code: 'LA21277-1', display: 'Chromosome Y' }]
]);

/** Undefined for anything not in LL2938-0, including MT, decoys and alt contigs. */
export function chromosomeCoding(chrom: string): LoincCoding | undefined {
  const normalised = chrom.trim().replace(/^chr/i, '').toUpperCase();
  return CHROMOSOME_ANSWERS.get(normalised);
}
