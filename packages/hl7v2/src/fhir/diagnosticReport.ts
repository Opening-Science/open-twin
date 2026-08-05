/**
 * WHAT: Maps HL7 v2 segments into FHIR resources.
 * NOT:  Must not invent LOINC/SNOMED beyond allowlisted/table-driven mappings.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: HL7 v2-to-FHIR IG expectations; signed review record for coded Observations; HL7 validator on emitted bundles.
 */
import { deterministicId } from '@open-twin/fhir-core';
import type { DiagnosticReport, Identifier, Reference } from 'fhir/r4';
import type { IssueLog } from '../issues';
import { cweToCodeableConcept, type DatatypeContext, eiToIdentifier } from '../v2/datatypes';
import { parseV2DateTime, v2Instant } from '../v2/datetime';
import { field, repetition, type Segment } from '../v2/parser';
import { DIAGNOSTIC_REPORT_STATUS } from '../v2/tables';

/**
 * OBR to DiagnosticReport.
 *
 * Source: IG segment map OBR[DiagnosticReport]. Implemented here:
 *   OBR-2  -> identifier[1] with type PLAC
 *   OBR-3  -> identifier[2] with type FILL
 *   OBR-4  -> code (CWE[CodeableConcept])
 *   OBR-7  -> effectiveDateTime, or effectivePeriod.start when OBR-8 is valued
 *   OBR-8  -> effectivePeriod.end
 *   OBR-22 -> issued
 *   OBR-25 -> status (ResultStatus[Non-Queries])
 *
 * The IG also maps this OBR to a Specimen and, when an ORC is present, to a
 * ServiceRequest. Neither is implemented; see README.
 */
export interface DiagnosticReportInput {
  readonly datatypes: DatatypeContext;
  readonly connector: string;
  readonly subjectKey: string;
  readonly messageControlId: string;
  readonly subject: Reference;
  readonly encounter?: Reference;
  readonly results: readonly Reference[];
}

export function obrToDiagnosticReport(
  segment: Segment,
  input: DiagnosticReportInput,
  issues: IssueLog
): DiagnosticReport | undefined {
  const { datatypes } = input;
  const encoding = datatypes.encoding;
  const at = { segment: segment.name, position: segment.position };

  const statusCode = field(segment, 25, 1, encoding);
  const status = statusCode === undefined ? undefined : DIAGNOSTIC_REPORT_STATUS[statusCode];
  if (status === undefined) {
    // The IG records that an absent OBR-25 "is an error on the v2 side as in this
    // use case it is required". `DiagnosticReport.status` is 1..1 and required-bound,
    // and no member of that value set means "not stated", so there is no report to
    // emit — the Observations survive on their own.
    issues.add(
      statusCode === undefined
        ? 'OBR-25 is absent although a result message requires it; no DiagnosticReport emitted'
        : 'OBR-25 carries a result status with no mapping in HL7 table 0123; no DiagnosticReport emitted',
      statusCode === undefined ? 'validation' : 'unsupported',
      { ...at, field: 'OBR-25' }
    );
    return undefined;
  }

  const code = cweToCodeableConcept(repetition(segment, 4), datatypes);
  if (code === undefined) {
    issues.add('OBR-4 is empty, so the report has no identifiable code; no DiagnosticReport emitted', 'validation', {
      ...at,
      field: 'OBR-4'
    });
    return undefined;
  }

  const identifiers: Identifier[] = [];
  const malformed = (field_: string) => () => {
    issues.add(
      `${field_} declares a namespace whose universal ID is not a valid OID or UUID; the identifier has no system`,
      'validation',
      { ...at, field: field_ }
    );
  };
  const placer = eiToIdentifier(repetition(segment, 2), datatypes, 'PLAC', malformed('OBR-2'));
  if (placer) identifiers.push(placer);
  const filler = eiToIdentifier(repetition(segment, 3), datatypes, 'FILL', malformed('OBR-3'));
  if (filler) identifiers.push(filler);

  const report: DiagnosticReport = {
    resourceType: 'DiagnosticReport',
    id: deterministicId({
      connector: input.connector,
      subjectKey: input.subjectKey,
      recordId: filler?.value ?? placer?.value ?? input.messageControlId,
      measure: `obr-${segment.position}`
    }),
    status: status as DiagnosticReport['status'],
    code: code.concept,
    subject: input.subject
  };

  if (identifiers.length > 0) report.identifier = identifiers;
  if (input.encounter) report.encounter = input.encounter;

  const start = parseV2DateTime(field(segment, 7, 1, encoding));
  const end = parseV2DateTime(field(segment, 8, 1, encoding));
  if (end.ok && start.ok) report.effectivePeriod = { start: start.parsed.value, end: end.parsed.value };
  else if (start.ok) report.effectiveDateTime = start.parsed.value;

  // `issued` is an `instant`: a moment, which needs both seconds and an offset. A
  // v2 timestamp without an offset cannot be turned into one without asserting a
  // timezone the sender did not state.
  const issued = v2Instant(field(segment, 22, 1, encoding));
  if (issued) report.issued = issued;
  else if (field(segment, 22, 1, encoding) !== undefined) {
    issues.add('OBR-22 has no UTC offset, so it cannot be expressed as a FHIR instant', 'validation', {
      ...at,
      field: 'OBR-22'
    });
  }

  if (input.results.length > 0) report.result = [...input.results];

  return report;
}
