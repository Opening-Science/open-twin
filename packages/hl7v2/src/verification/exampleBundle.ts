/**
 * WHAT: Builds a fixture Bundle used by emit-bundles / local verification.
 * NOT:  Must not be treated as production PHI; must not skip validator assumptions.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: HL7 validator (CI fhir-validate).
 */
import type { Bundle } from 'fhir/r4';
import { convertMessage } from '../fhir/bundleBuilder';
import { ORU_R01 } from '../tests/fixtures/messages';

/**
 * The bundle handed to the HL7 validator in CI.
 *
 * It is built by running this connector's own public entry point over the HL7
 * Version 2 to FHIR Implementation Guide's own ORU^R01 example message, so what the
 * validator checks is what the library emits. A checked-in JSON fixture would
 * validate the fixture instead of the code, which is the same mistake as a snapshot
 * test asserting its own output.
 *
 * The message exercises: five declared encoding characters including the truncation
 * character; a repeating PID-5; PID-7 with a time where FHIR wants a date; PID-8
 * through the administrative-gender map; PV1-2 through both patient-class maps; an
 * OBR with a LOINC code and an OBR-22 that has no offset; three OBX segments of
 * which two are NM with a UCUM unit and one is an SN this connector refuses to
 * approximate; an order-level NTE the IG leaves unmapped.
 *
 * `timestamp` is only a fallback here — MSH-7 carries an offset, so the bundle takes
 * its timestamp from the message. It is passed explicitly so the output is
 * reproducible byte for byte.
 */
export function hl7v2OruBundle(): Bundle {
  return convertMessage(ORU_R01, { timestamp: '2026-07-26T10:00:00Z' }).bundle;
}

/**
 * The same conversion including the reported issues, for anyone who wants to see
 * what the connector declined to convert rather than only what it produced.
 */
export function hl7v2OruConversion() {
  return convertMessage(ORU_R01, { timestamp: '2026-07-26T10:00:00Z' });
}
