/**
 * WHAT: Issue log helpers for conversion diagnostics without payload dumps.
 * NOT:  Must not log raw message bodies containing PHI.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { ConnectorError, type ConnectorErrorCode, toOperationOutcome } from '@open-twin/fhir-core';
import type { OperationOutcome } from 'fhir/r4';

export const CONNECTOR = 'genomics-vcf';

/**
 * Everything this connector can complain about.
 *
 * A VCF is genomic data about an identifiable person, so no diagnostic may quote
 * the file: not a chromosome, not a position, not a sample name, not an allele,
 * not even a FORMAT key (a key is chosen by the caller's pipeline and can be
 * distinctive). Each kind therefore maps to one fixed English sentence, and the
 * only thing the connector adds is how many times it happened.
 *
 * A count is aggregate telemetry — it says how much of a file was unusable, which
 * is exactly what an operator needs — and it cannot identify anyone. That is the
 * whole of what escapes: a kind and a count.
 */
export type VcfIssueKind =
  | 'fileformat-missing'
  | 'fileformat-out-of-scope'
  | 'header-declaration-invalid'
  | 'reference-build-absent'
  | 'reference-build-conflict'
  | 'reference-build-unrecognised'
  | 'chromosome-unmapped'
  | 'record-malformed'
  | 'record-position-invalid'
  | 'record-ref-invalid'
  | 'alt-symbolic-unsupported'
  | 'alt-breakend-unsupported'
  | 'alt-spanning-deletion-skipped'
  | 'alt-absent'
  | 'gvcf-reference-block-skipped'
  | 'record-filtered'
  | 'info-field-undeclared'
  | 'info-cardinality-mismatch'
  | 'info-value-untypable'
  | 'format-field-undeclared'
  | 'format-cardinality-mismatch'
  | 'format-value-untypable'
  | 'genotype-absent'
  | 'genotype-no-call'
  | 'effective-date-absent';

interface IssueDefinition {
  message: string;
  /**
   * `undefined` means "expected, not a problem" — it is counted in the summary but
   * never appears in the OperationOutcome. A record excluded because its FILTER
   * column says the caller's own pipeline rejected it is the connector working, not
   * failing, and reporting it as a FHIR issue of severity `error` would train
   * operators to ignore the outcome.
   */
  code?: ConnectorErrorCode;
}

const ISSUES: Record<VcfIssueKind, IssueDefinition> = {
  'fileformat-missing': {
    message: 'The VCF header carries no ##fileformat line, which the VCF specification requires as the first line',
    code: 'validation'
  },
  'fileformat-out-of-scope': {
    message:
      'The declared ##fileformat version is outside the 4.0-4.3 range this connector was written against; the file was parsed on a best-effort basis',
    code: 'unsupported'
  },
  'header-declaration-invalid': {
    message: 'A structured header declaration could not be read and was ignored',
    code: 'validation'
  },
  'reference-build-absent': {
    message:
      'The header declares no reference genome build (no usable ##reference and no ##contig assembly), so no reference sequence assembly component was emitted. The build is never assumed',
    code: 'validation'
  },
  'reference-build-conflict': {
    message:
      'The header declares more than one reference genome build and they disagree, so no reference sequence assembly component was emitted',
    code: 'validation'
  },
  'reference-build-unrecognised': {
    message:
      'The declared reference genome build does not match any concept in LOINC answer list LL1040-6, so no reference sequence assembly component was emitted',
    code: 'validation'
  },
  'chromosome-unmapped': {
    message:
      'The CHROM value does not correspond to a human chromosome in LOINC answer list LL2938-0, so no chromosome identifier component was emitted',
    code: 'validation'
  },
  'record-malformed': {
    message: 'A data line did not have the eight mandatory VCF columns and was skipped',
    code: 'validation'
  },
  'record-position-invalid': {
    message: 'A data line carried a POS that is not a positive integer and was skipped',
    code: 'validation'
  },
  'record-ref-invalid': {
    message: 'A data line carried a REF that is not a non-empty run of A, C, G, T or N and was skipped',
    code: 'validation'
  },
  'alt-symbolic-unsupported': {
    message: 'A symbolic ALT allele (<...>) was skipped: structural variants are out of scope',
    code: 'unsupported'
  },
  'alt-breakend-unsupported': {
    message: 'A breakend ALT allele was skipped: structural variants are out of scope',
    code: 'unsupported'
  },
  'alt-spanning-deletion-skipped': {
    message:
      'A spanning-deletion ALT allele (*) was skipped: it asserts an upstream deletion rather than a variant at this position',
    code: 'unsupported'
  },
  'alt-absent': { message: 'A data line carried no ALT allele, so there was no variant to assert' },
  'gvcf-reference-block-skipped': {
    message: 'A gVCF reference block was skipped: non-variant blocks are out of scope',
    code: 'unsupported'
  },
  'record-filtered': { message: 'A data line was excluded because its FILTER column is neither PASS nor missing' },
  'info-field-undeclared': {
    message: 'An INFO key was used that the header does not declare; it was read as a string and not mapped',
    code: 'validation'
  },
  'info-cardinality-mismatch': {
    message: 'An INFO value had a different number of elements than its header declaration requires',
    code: 'validation'
  },
  'format-field-undeclared': {
    message: 'A FORMAT key was used that the header does not declare; it was read as a string and not mapped',
    code: 'validation'
  },
  'info-value-untypable': {
    message:
      'An INFO value did not match the Type its header declaration gives; it was recorded as missing, never as zero',
    code: 'validation'
  },
  'format-cardinality-mismatch': {
    message: 'A FORMAT value had a different number of elements than its header declaration requires',
    code: 'validation'
  },
  'format-value-untypable': {
    message:
      'A FORMAT value did not match the Type its header declaration gives; it was recorded as missing, never as zero',
    code: 'validation'
  },
  'genotype-absent': { message: 'No GT value was available for the selected sample, so no allelic state was asserted' },
  'genotype-no-call': { message: 'The GT for the selected sample is a no-call' },
  'effective-date-absent': {
    message:
      'Neither a caller-supplied date nor a ##fileDate header was available, so Observation.effective[x] was omitted',
    code: 'validation'
  }
};

/**
 * Counts what went wrong, once per kind, and turns the subset that is genuinely a
 * problem into an OperationOutcome (D6: absence of data is not an exception).
 */
export class IssueLog {
  private readonly counts = new Map<VcfIssueKind, number>();

  add(kind: VcfIssueKind, times = 1): void {
    this.counts.set(kind, (this.counts.get(kind) ?? 0) + times);
  }

  count(kind: VcfIssueKind): number {
    return this.counts.get(kind) ?? 0;
  }

  /** Every kind seen, including the expected exclusions that are not FHIR issues. */
  summary(): Partial<Record<VcfIssueKind, number>> {
    return Object.fromEntries(this.counts);
  }

  toOperationOutcome(): OperationOutcome | undefined {
    const errors: ConnectorError[] = [];
    for (const [kind, times] of this.counts) {
      const definition = ISSUES[kind];
      if (!definition.code) continue;
      errors.push(
        new ConnectorError(`${definition.message} (${times} occurrence${times === 1 ? '' : 's'})`, {
          code: definition.code,
          connector: CONNECTOR,
          operation: `vcf-to-fhir:${kind}`
        })
      );
    }
    return toOperationOutcome(errors);
  }
}

/** A failure that stops the whole conversion. Carries no part of the file. */
export function fatal(message: string, code: ConnectorErrorCode, operation: string): ConnectorError {
  return new ConnectorError(message, { code, connector: CONNECTOR, operation });
}
