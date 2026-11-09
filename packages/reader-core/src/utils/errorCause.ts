/**
 * WHAT: causeClassName: the only part of an error's cause that a ConnectorError keeps.
 * NOT:  Keeps no message: a fetch rejection names the URL, a JSON parse error quotes the body, and loggers serialise `cause`.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export function causeClassName(cause: unknown): string | undefined {
  if (cause === undefined) return undefined;

  return cause instanceof Error ? cause.name : typeof cause;
}
