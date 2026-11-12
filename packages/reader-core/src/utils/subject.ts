/**
 * WHAT: subjectIdentifierSystem: the Foundation-controlled identifier namespace of a reader, as `SYSTEMS.*_IDENTIFIER` spells it.
 * NOT:  Mints no identifier value; the subject key is the value (D2).
 * GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export function subjectIdentifierSystem(readerId: string): string {
  return `http://opentwin.ch/fhir/sid/${readerId}`;
}
