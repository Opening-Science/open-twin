import { type FhirIssue, issue } from '../issues';
import type { EntryView } from './fullurl';
import { isObject, type JsonObject, walkObjects } from './walk';

/** `Type/id`, optionally version-specific. The form a relative reference may take. */
const RELATIVE_REFERENCE = /^([A-Za-z]+)\/([A-Za-z0-9\-.]{1,64})(?:\/_history\/([A-Za-z0-9\-.]{1,64}))?$/;
const ABSOLUTE_URI = /^[a-z][a-z0-9+.-]*:/i;

export interface ReferenceIndex {
  /** Every `entry.fullUrl` in the bundle. */
  fullUrls: Set<string>;
  /** Every `Type/id` a bundle entry can be addressed by. */
  relative: Set<string>;
}

/**
 * What a reference inside this bundle is allowed to resolve to.
 *
 * A `Type/id` key is registered both from `entry.resource.id` and from the tail of a
 * RESTful `fullUrl`, because a receiver will accept either and a validator that only
 * accepted one would manufacture failures.
 */
export function buildReferenceIndex(views: readonly EntryView[]): ReferenceIndex {
  const fullUrls = new Set<string>();
  const relative = new Set<string>();

  for (const view of views) {
    if (view.fullUrl) {
      fullUrls.add(view.fullUrl);
      const tail = /\/([A-Za-z]+\/[A-Za-z0-9\-.]{1,64})$/.exec(view.fullUrl);
      if (tail?.[1]) relative.add(tail[1]);
    }
    if (view.resourceType && typeof view.resource?.id === 'string') {
      relative.add(`${view.resourceType}/${view.resource.id}`);
    }
  }

  return { fullUrls, relative };
}

export interface ReferenceSite {
  value: string;
  /** FHIRPath of the `reference` element itself. */
  path: string;
  /** The resource the reference sits inside, for `#contained` resolution. */
  container: JsonObject;
}

export function collectReferences(root: JsonObject, path: string): ReferenceSite[] {
  const sites: ReferenceSite[] = [];
  for (const { node, path: nodePath } of walkObjects(root, path)) {
    if (typeof node.reference === 'string' && node.resourceType === undefined) {
      sites.push({ value: node.reference, path: `${nodePath}.reference`, container: root });
    }
  }
  return sites;
}

/**
 * Reference resolution *inside* a bundle.
 *
 * The severities differ by reference form, because the forms make different
 * promises. A `urn:uuid:` reference is only meaningful inside the bundle that
 * carries the matching `fullUrl` — nothing on the receiving server can resolve it —
 * so a dangling one is reported. A relative `Type/id` reference may legitimately
 * point at a resource the receiver already holds, so its absence from the bundle is
 * information, not a defect; reporting it as one would fail almost every real-world
 * collection bundle.
 *
 * The dangling URN is a **warning**, not an error, and that is not this package's
 * judgement: the HL7 reference validator reports exactly one line for it,
 * `Warning - URN reference is not locally contained within the bundle`, and where the
 * two disagree the validator is right. `normaliseBundle` treats the same finding as
 * blocking, because it rewrites the entire reference graph and cannot rewrite a
 * reference that points nowhere — a stricter local rule, applied where it belongs
 * and not smuggled into a conformance report.
 */
export function checkReferences(sites: readonly ReferenceSite[], index: ReferenceIndex): FhirIssue[] {
  const issues: FhirIssue[] = [];

  for (const site of sites) {
    const value = site.value;

    if (value.startsWith('#')) {
      const id = value.slice(1);
      const contained = Array.isArray(site.container.contained) ? site.container.contained : [];
      const found = contained.some((item) => isObject(item) && item.id === id);
      if (!found) {
        issues.push(
          issue(
            'error',
            'not-found',
            'ot-reference-unresolved-contained',
            site.path,
            'A fragment reference must name a resource in the `contained` array of the resource that carries it.'
          )
        );
      }
      continue;
    }

    if (value.startsWith('urn:')) {
      if (!index.fullUrls.has(value)) {
        issues.push(
          issue(
            'warning',
            'not-found',
            'ot-reference-unresolved-urn',
            site.path,
            'A urn: reference can only be resolved against an entry.fullUrl in the same bundle, and no entry carries it.'
          )
        );
      }
      continue;
    }

    if (RELATIVE_REFERENCE.test(value)) {
      if (!index.relative.has(stripVersion(value))) {
        issues.push(
          issue(
            'information',
            'informational',
            'ot-reference-external',
            site.path,
            'This relative reference does not resolve inside the bundle. It is only valid if the receiver already holds the target.'
          )
        );
      }
      continue;
    }

    if (ABSOLUTE_URI.test(value)) {
      const tail = /\/([A-Za-z]+\/[A-Za-z0-9\-.]{1,64})$/.exec(value)?.[1];
      if (!index.fullUrls.has(value) && !(tail && index.relative.has(tail))) {
        issues.push(
          issue(
            'information',
            'informational',
            'ot-reference-external',
            site.path,
            'This absolute reference points outside the bundle. Resolving it is the receiving system responsibility.'
          )
        );
      }
      continue;
    }

    issues.push(
      issue(
        'error',
        'value',
        'ot-reference-malformed',
        site.path,
        'Reference.reference must be a fragment (#id), a relative Type/id, or an absolute URI.'
      )
    );
  }

  return issues;
}

function stripVersion(value: string): string {
  const match = RELATIVE_REFERENCE.exec(value);
  return match ? `${match[1]}/${match[2]}` : value;
}
