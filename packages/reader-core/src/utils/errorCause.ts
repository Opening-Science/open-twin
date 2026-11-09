/**
 * WHAT: causeClassName: the only part of an error's cause that a ConnectorError keeps.
 * NOT:  Keeps no message, and no name that is not a plain class name: a fetch rejection names the URL, a JSON parse error quotes the body, and loggers serialise `cause`.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
const CLASS_NAME = /^[A-Z][A-Za-z]*$/;

export function causeClassName(cause: unknown): string | undefined {
  if (cause === undefined) return undefined;

  if (!(cause instanceof Error)) return typeof cause;

  return CLASS_NAME.test(cause.name) ? cause.name : 'Error';
}
