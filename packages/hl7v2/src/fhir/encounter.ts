import { deterministicId } from '@open-twin/fhir-core';
import type { Encounter, Reference } from 'fhir/r4';
import type { IssueLog } from '../issues';
import { cxToIdentifier, type DatatypeContext } from '../v2/datatypes';
import { parseV2DateTime } from '../v2/datetime';
import { field, repetition, type Segment } from '../v2/parser';
import { ENCOUNTER_CLASS, ENCOUNTER_STATUS } from '../v2/tables';

/**
 * PV1 to Encounter.
 *
 * Source: IG segment map PV1[Encounter]. Implemented here:
 *   PV1-2  -> class  (PatientClass[EncounterClass]) and status (PatientClass[EncounterStatus])
 *   PV1-19 -> identifier (the visit number)
 *   PV1-44 -> period.start, PV1-45 -> period.end
 *
 * Not implemented: locations, participants, hospitalization, service type, admit
 * source, financial class, and the rest. Each pulls in a Location, Practitioner or
 * Organization resource that this connector would have to invent an identity for.
 */
export interface EncounterResult {
  readonly encounter: Encounter;
  readonly reference: Reference;
}

export function pv1ToEncounter(
  segment: Segment,
  context: DatatypeContext,
  issues: IssueLog,
  identity: { connector: string; subjectKey: string; messageControlId: string },
  subject: Reference
): EncounterResult | undefined {
  const patientClass = field(segment, 2, 1, context.encoding);
  const mappedClass = patientClass === undefined ? undefined : ENCOUNTER_CLASS[patientClass];
  const mappedStatus = patientClass === undefined ? undefined : ENCOUNTER_STATUS[patientClass];

  if (mappedClass === undefined || mappedStatus === undefined) {
    // `Encounter.class` is 1..1 and `Encounter.status` is required. Without a
    // patient class this connector can read, there is no Encounter to emit — and an
    // Encounter defaulted to "ambulatory, in progress" would be a fact nobody sent.
    issues.add('PV1-2 carries a patient class with no mapping in HL7 table 0004; no Encounter emitted', 'unsupported', {
      segment: segment.name,
      position: segment.position,
      field: 'PV1-2'
    });
    return undefined;
  }

  const id = deterministicId({
    connector: identity.connector,
    subjectKey: identity.subjectKey,
    recordId: identity.messageControlId,
    measure: `encounter-${segment.position}`
  });

  const encounter: Encounter = {
    resourceType: 'Encounter',
    id,
    status: mappedStatus as Encounter['status'],
    class: { system: mappedClass.system, code: mappedClass.code, display: mappedClass.display },
    subject
  };

  const visitNumber = cxToIdentifier(repetition(segment, 19), context, () => {
    issues.add(
      'PV1-19 declares an assigning authority whose universal ID is not a valid OID or UUID; the identifier has no system',
      'validation',
      { segment: segment.name, position: segment.position, field: 'PV1-19' }
    );
  });
  if (visitNumber) encounter.identifier = [visitNumber];

  const start = parseV2DateTime(field(segment, 44, 1, context.encoding));
  const end = parseV2DateTime(field(segment, 45, 1, context.encoding));
  if (start.ok || end.ok) {
    encounter.period = {
      ...(start.ok ? { start: start.parsed.value } : {}),
      ...(end.ok ? { end: end.parsed.value } : {})
    };
  }

  return { encounter, reference: { reference: `urn:uuid:${id}` } };
}
