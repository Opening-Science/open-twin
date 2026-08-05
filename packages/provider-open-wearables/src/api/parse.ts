/**
 * WHAT: Exports symbols for `packages/provider-open-wearables/src/api/parse.ts`.
 * NOT:  Must not invent terminology codes or units; that responsibility is clinical review + verify/ gates.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d3; DECISIONS.md#d4
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { ConnectorError } from '@open-twin/fhir-core';
import type { z } from 'zod/v4';
import { CONNECTOR } from '../config/constants';

/**
 * Parses an untrusted response body without ever putting the body into an error.
 *
 * `ZodError.message` embeds the offending values, and `error.cause` propagates the
 * whole issue array, so both the message and the cause chain of a naive
 * `schema.parse(input)` carry patient data straight into application logs, stack
 * traces and error-reporting services. Only the *paths* are retained here — those
 * are field names from the schema this package declares, never values.
 *
 * Assume every input is a real patient's record.
 */
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown, operation: string): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const paths = new Set<string>();
  for (const issue of result.error.issues) {
    // Numeric array indices are replaced: index 47 of a page identifies which
    // patient record failed, and that is a re-identification hint, not a field name.
    paths.add(
      issue.path.map((segment) => (typeof segment === 'number' ? '[]' : String(segment))).join('.') || '(root)'
    );
  }

  throw new ConnectorError('Response did not match the expected Open Wearables schema', {
    code: 'validation',
    connector: CONNECTOR.connector,
    operation: `${operation} — fields: ${[...paths].sort().join(', ')}`
  });
}
