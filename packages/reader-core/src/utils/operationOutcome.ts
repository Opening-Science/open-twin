/**
 * WHAT: issueFromOperationOutcome: a vendor OperationOutcome issue as a reader Issue.
 * NOT:  Adds nothing to the diagnostics; the connectors already keep payloads out of them.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import type { OperationOutcomeIssue } from 'fhir/r4';
import type { Issue } from '../types';

export function issueFromOperationOutcome(issue: OperationOutcomeIssue): Issue {
  return {
    severity: issue.severity === 'fatal' ? 'error' : issue.severity,
    code: issue.code,
    details: issue.diagnostics ?? 'The vendor reported a problem with one requested type.'
  };
}
