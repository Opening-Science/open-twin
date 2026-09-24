/**
 * WHAT: Maps HL7 v2 segments into FHIR resources.
 * NOT:  Must not invent LOINC/SNOMED beyond allowlisted/table-driven mappings.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: HL7 v2-to-FHIR IG expectations; signed review record for coded Observations; HL7 validator on emitted bundles.
 */
import { patientUuid } from '@open-twin/fhir-core';
import type { Patient } from 'fhir/r4';
import type { IssueLog } from '../issues';
import { cxToIdentifier, type DatatypeContext, xpnToHumanName } from '../v2/datatypes';
import { parseV2DateTime, v2Date } from '../v2/datetime';
import { component, field, repetitions, type Segment, subcomponent } from '../v2/parser';
import { ADMINISTRATIVE_GENDER } from '../v2/tables';

/**
 * PID to Patient.
 *
 * Source: IG segment map PID[Patient]. Implemented here:
 *   PID-3  -> identifier    (CX[Identifier])
 *   PID-5  -> name          (XPN[HumanName])
 *   PID-7  -> birthDate     (`date`, per the IG's own target type)
 *   PID-8  -> gender        (CWE[code] via the AdministrativeSex map)
 *   PID-29 -> deceasedDateTime, PID-30 -> deceasedBoolean when PID-29 is absent
 *
 * Everything else the IG maps — address, telecom, race, ethnicity, religion,
 * language, marital status, mother's maiden name, SSN, driver's licence, citizenship
 * — is deliberately **not** mapped. Each is directly identifying, none is needed by
 * the observation-centred use case this connector exists for, and a connector that
 * copies every field of a PID by default makes a re-identification decision on the
 * integrator's behalf. See README.
 */
export interface PatientResult {
  readonly patient: Patient;
  /** The key the deterministic subject and resource ids are derived from. */
  readonly subjectKey: string;
}

export function pidToPatient(
  segment: Segment,
  context: DatatypeContext,
  issues: IssueLog,
  connector: string,
  sourceNamespace?: string,
  suppliedSubject?: string
): PatientResult | undefined {
  const at = { segment: segment.name, position: segment.position };
  const identifiers = repetitions(segment, 3)
    .map((rep) =>
      cxToIdentifier(rep, context, () => {
        issues.add(
          'PID-3 declares an assigning authority whose universal ID is not a valid OID or UUID; the identifier has no system',
          'validation',
          { ...at, field: 'PID-3' }
        );
      })
    )
    .filter((identifier) => identifier !== undefined);

  const names = repetitions(segment, 5)
    .map((rep) => xpnToHumanName(rep, context))
    .filter((name) => name !== undefined);

  // D1/D2: a stable key for this person, taken from the identifier the sender
  // considers primary. It is the message control id's business to change between
  // sends; the patient key must not, or every resend creates a new patient.
  const primary = identifiers[0];
  const primaryRepetition = repetitions(segment, 3).find((rep) => component(rep, 1, context.encoding));
  const localAuthority = [1, 2, 3].map((part) => subcomponent(primaryRepetition, 4, part, context.encoding) ?? '');
  const namespace =
    primary?.system ?? (sourceNamespace ? JSON.stringify([sourceNamespace, localAuthority]) : undefined);
  const subjectKey =
    primary?.value && namespace
      ? JSON.stringify(['identifier', namespace, primary.value])
      : suppliedSubject
        ? JSON.stringify(['subject', suppliedSubject])
        : undefined;
  if (!subjectKey) {
    issues.add(
      'A stable patient identifier and namespace, or an explicit subject reference, are required',
      'validation',
      { ...at, field: 'PID-3' }
    );
    return undefined;
  }

  const patient: Patient = {
    resourceType: 'Patient',
    id: patientUuid(connector, subjectKey)
  };
  if (identifiers.length > 0) patient.identifier = identifiers;
  if (names.length > 0) patient.name = names;

  const birthDate = v2Date(field(segment, 7, 1, context.encoding));
  if (birthDate) patient.birthDate = birthDate;

  const sex = field(segment, 8, 1, context.encoding);
  if (sex !== undefined) {
    const gender = ADMINISTRATIVE_GENDER[sex];
    if (gender) {
      patient.gender = gender;
    } else {
      // `Patient.gender` binds to administrative-gender as *required*, so an
      // unrecognised code cannot be passed through: the resource would be invalid.
      // Nor may it be quietly turned into `unknown`, which asserts that the sender
      // said the gender is unknown when in fact this connector failed to read it.
      issues.add('PID-8 carries an administrative sex code with no mapping in HL7 table 0001', 'unsupported', {
        ...at,
        field: 'PID-8'
      });
    }
  }

  const deceased = parseV2DateTime(field(segment, 29, 1, context.encoding));
  if (deceased.ok) {
    patient.deceasedDateTime = deceased.parsed.value;
  } else {
    const indicator = field(segment, 30, 1, context.encoding);
    if (indicator === 'Y') patient.deceasedBoolean = true;
    else if (indicator === 'N') patient.deceasedBoolean = false;
  }

  return { patient, subjectKey };
}
