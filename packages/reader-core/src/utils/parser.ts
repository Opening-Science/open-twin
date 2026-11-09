/**
 * WHAT: Parser, the part of a zod schema the base class uses, and failedFieldPaths for an error that names fields.
 * NOT:  Does not depend on zod; any schema library with safeParse fits.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: only the paths of a failed config parse may be named. A response's paths can carry keys from the payload.
 */
type ParseIssues = { issues: Array<{ path: PropertyKey[] }> };

export interface Parser<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: ParseIssues };
}

export function failedFieldPaths(error: ParseIssues): string {
  return error.issues.map((issue) => issue.path.map(String).join('.') || '(root)').join(', ');
}
