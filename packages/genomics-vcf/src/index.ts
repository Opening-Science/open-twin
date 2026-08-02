/**
 * WHAT: Package public barrel: re-exports the supported API surface.
 * NOT:  Must not contain mapping or clinical logic; implementation lives in sibling modules.
GOVERNED BY: DECISIONS.md#d9
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export { CONNECTOR_VERSION, type VcfToFhirOptions, type VcfToFhirResult, vcfToFhirBundle } from './fhir/bundleBuilder';
export {
  ALLELIC_STATE_ANSWER,
  assemblyCoding,
  COMPONENT,
  COORDINATE_SYSTEM_ANSWER,
  chromosomeCoding,
  DBSNP,
  GENOMICS_REPORTING,
  V2_0074,
  VARIANT_ASSESSMENT,
  VARIANT_PRESENCE
} from './fhir/terminology';
export { mapVariantToObservation, type VariantMappingInput } from './fhir/variant';
export { CONNECTOR, IssueLog, type VcfIssueKind } from './issues';
export { type AltKind, classifyAlt } from './vcf/alleles';
export {
  type GenomicCoordinateSystem,
  type GenomicRange,
  genomicRange,
  oneBasedCharacterRange,
  zeroBasedInterbaseRange
} from './vcf/coordinates';
export { type AlleleCall, type AllelicState, callForAlt, type VariantPresence } from './vcf/genotype';
export { parseHeader, parseStructuredBody, parseVcfNumber } from './vcf/header';
export { expectedValueCount, parseGenotype, parseInfo, parseRecords } from './vcf/records';
export { detectGenomeBuild, fileDateToFhirDate } from './vcf/reference';
export type {
  VcfContig,
  VcfFieldDeclaration,
  VcfGenotype,
  VcfHeader,
  VcfNumber,
  VcfRecord,
  VcfScalar,
  VcfValueType
} from './vcf/types';
