/**
 * WHAT: Orchestrates fetch/parse/map (or map-only) into a FHIR Bundle result.
 * NOT:  Must not swallow partial failures; issues go to OperationOutcome (ADR 0006).
GOVERNED BY: DECISIONS.md#d5; DECISIONS.md#d6
 * CORRECTNESS: HL7 validator on emitted bundles in CI; terminology/unit gates on source codings.
 */
import { buildBundle, patientUuid, subjectReference } from '@open-twin/fhir-core';
import type { Bundle, FhirResource, OperationOutcome, Patient, Reference } from 'fhir/r4';
import { CONNECTOR, fatal, IssueLog, type VcfIssueKind } from '../issues';
import { classifyAlt } from '../vcf/alleles';
import type { GenomicCoordinateSystem } from '../vcf/coordinates';
import { callForAlt } from '../vcf/genotype';
import { parseHeader } from '../vcf/header';
import { parseGenotype, parseRecords } from '../vcf/records';
import { detectGenomeBuild, fileDateToFhirDate } from '../vcf/reference';
import type { VcfGenotype, VcfRecord } from '../vcf/types';
import { mapVariantToObservation } from './variant';

export const CONNECTOR_VERSION = '0.1.0';

export interface VcfToFhirOptions {
  /**
   * D1: when the integrator knows who this is, they say so and it is used verbatim.
   * Required for a VCF with no sample columns — see `subjectKey` below.
   */
  subject?: Reference;
  /**
   * Which sample column to map. Required when the file has more than one: a bundle
   * describes one subject, and picking the first column silently would attribute one
   * member of a joint call to another.
   */
  sampleId?: string;
  /**
   * Which coordinate system the emitted `exact-start-end` Range is expressed in.
   * Declared in the resource either way (LOINC 92822-6). Defaults to 1-based
   * character counting, which is VCF's own system and the one the IG's examples use,
   * so the default applies no arithmetic to the file's positions.
   */
  coordinateSystem?: GenomicCoordinateSystem;
  /** `Observation.effective[x]`. Falls back to `##fileDate`. */
  effectiveDateTime?: string;
  /** Bundle timestamp. Supplied by the caller so bundles are reproducible. */
  timestamp?: string;
  bundleType?: 'collection' | 'transaction';
}

export interface VcfToFhirResult {
  bundle: Bundle;
  /** D6: problems are reported, not thrown. Undefined when there were none. */
  issues?: OperationOutcome;
  /**
   * Every issue kind seen and how many times, including the expected exclusions
   * (filtered records, absent genotypes) that are not FHIR issues.
   */
  summary: Partial<Record<VcfIssueKind, number>>;
  variantCount: number;
}

/**
 * A record is mapped only when FILTER says it passed.
 *
 * `PASS` and `.` mean "passed all filters" and "no filtering applied". Anything else
 * is the caller's own pipeline saying it does not believe the call. There is
 * deliberately no option to include those anyway: the Variant profile has nowhere to
 * put the reason without a code system this connector could not verify, so an
 * included record would be indistinguishable from a confident one. Excluding it and
 * counting it is recoverable; publishing it as final is not.
 */
function passesFilter(record: VcfRecord): boolean {
  return record.filters.length === 0 || (record.filters.length === 1 && record.filters[0] === 'PASS');
}

function selectSample(sampleNames: string[], requested: string | undefined): string | undefined {
  if (sampleNames.length === 0) return undefined;
  if (requested !== undefined) {
    if (!sampleNames.includes(requested)) {
      throw fatal('The requested sample column is not present in this VCF', 'validation', 'select-sample');
    }
    return requested;
  }
  if (sampleNames.length > 1) {
    throw fatal(
      'This VCF contains more than one sample column; pass sampleId to choose which subject the bundle describes',
      'unsupported',
      'select-sample'
    );
  }
  return sampleNames[0];
}

function genotypeOf(record: VcfRecord, sample: string | undefined): VcfGenotype | undefined {
  if (sample === undefined) return undefined;
  const raw = record.samples.get(sample)?.get('GT')?.[0];
  return typeof raw === 'string' ? parseGenotype(raw) : undefined;
}

/**
 * gVCF reference blocks are not variants.
 *
 * They are recognised by the `<NON_REF>` / `<*>` ALT that GATK and bcftools emit, or
 * by an `END` INFO key with no usable ALT — an interval assertion about how confident
 * the caller is that a *range* matches the reference. Emitting one as a variant
 * Observation would publish a non-variant as a finding.
 */
function isReferenceBlock(record: VcfRecord): boolean {
  const symbolicOnly = record.alts.length > 0 && record.alts.every((alt) => alt === '<NON_REF>' || alt === '<*>');
  return symbolicOnly || (record.info.has('END') && record.alts.length === 0);
}

export function vcfToFhirBundle(vcfText: string, options: VcfToFhirOptions = {}): VcfToFhirResult {
  const issues = new IssueLog();
  const lines = vcfText.split(/\r?\n/);
  const { header, chromLineIndex } = parseHeader(lines, issues);

  if (chromLineIndex < 0) {
    throw fatal('The VCF has no #CHROM header line, so its columns cannot be identified', 'validation', 'parse-header');
  }

  const sample = selectSample(header.samples, options.sampleId);
  if (sample === undefined && !options.subject) {
    // A sites-only VCF describes no individual. Inventing a subject for it is
    // exactly the defect D1 exists to prevent.
    throw fatal(
      'This VCF has no sample columns and therefore names no individual; supply subject explicitly',
      'validation',
      'select-subject'
    );
  }

  const subjectKey = sample ?? 'caller-supplied-subject';
  const subject = subjectReference({
    ...(options.subject ? { reference: options.subject } : {}),
    connector: CONNECTOR,
    subjectKey
  });

  const build = detectGenomeBuild(header, issues);
  const effectiveDateTime = options.effectiveDateTime ?? fileDateToFhirDate(header.fileDate);
  if (!effectiveDateTime) issues.add('effective-date-absent');

  const coordinateSystem: GenomicCoordinateSystem = options.coordinateSystem ?? 'one-based-character';
  const records = parseRecords(lines, chromLineIndex + 1, header, issues);

  const observations: FhirResource[] = [];
  for (const record of records) {
    if (isReferenceBlock(record)) {
      issues.add('gvcf-reference-block-skipped');
      continue;
    }
    if (record.alts.length === 0) {
      issues.add('alt-absent');
      continue;
    }
    if (!passesFilter(record)) {
      issues.add('record-filtered');
      continue;
    }

    const genotype = genotypeOf(record, sample);
    if (sample !== undefined && !genotype) issues.add('genotype-absent');

    for (let altOffset = 0; altOffset < record.alts.length; altOffset++) {
      const alt = record.alts[altOffset];
      if (alt === undefined) continue;
      const kind = classifyAlt(alt);
      if (kind !== 'sequence') {
        issues.add(
          kind === 'symbolic'
            ? 'alt-symbolic-unsupported'
            : kind === 'breakend'
              ? 'alt-breakend-unsupported'
              : kind === 'spanning-deletion'
                ? 'alt-spanning-deletion-skipped'
                : 'record-malformed'
        );
        continue;
      }

      const altIndex = altOffset + 1;
      const call = callForAlt(genotype, altIndex);
      if (call.presence === 'no-call' && sample !== undefined) issues.add('genotype-no-call');

      observations.push(
        mapVariantToObservation({
          record,
          altIndex,
          alt,
          subject,
          subjectKey,
          coordinateSystem,
          ...(build.coding ? { assembly: build.coding } : {}),
          ...(effectiveDateTime ? { effectiveDateTime } : {}),
          call,
          ...(sample === undefined ? {} : { formatValues: record.samples.get(sample) ?? new Map() }),
          issues
        })
      );
    }
  }

  const resources: FhirResource[] = [];
  if (!options.subject) {
    // D1: no caller-supplied reference, so the bundle carries the Patient the
    // urn:uuid points at. It asserts nothing about the person — in particular the
    // sample column name is hashed into the id and never published, because a sample
    // name is chosen by whoever ran the sequencer and can be a person's name.
    const patient: Patient = { resourceType: 'Patient', id: patientUuid(CONNECTOR, subjectKey) };
    resources.push(patient);
  }
  resources.push(...observations);

  const bundle = buildBundle({
    connector: { connector: CONNECTOR, version: CONNECTOR_VERSION },
    resources,
    timestamp: options.timestamp ?? new Date().toISOString(),
    bundleKey: `${CONNECTOR}|${subjectKey}`,
    ...(options.bundleType ? { type: options.bundleType } : {})
  });

  const outcome = issues.toOperationOutcome();
  return {
    bundle,
    ...(outcome ? { issues: outcome } : {}),
    summary: issues.summary(),
    variantCount: observations.length
  };
}
