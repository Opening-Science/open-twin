/**
 * WHAT: Resolves FHIR reference identities using the containing entry's RESTful base.
 * NOT:  Does not fetch targets, match patients or guess a base for opaque fullUrls.
 * GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d20
 * CORRECTNESS: HL7 FHIR R4 bundle.html#references — relative references require a RESTful containing fullUrl.
 * GOTCHA: Fragment identities are container-scoped comparison keys, not external references to contained resources.
 */
const ABSOLUTE_REFERENCE = /^[a-z][a-z0-9+.-]*:/i;
const RELATIVE_REFERENCE = /^[A-Za-z]+\/[A-Za-z0-9.-]{1,64}(?:\/_history\/[A-Za-z0-9.-]{1,64})?$/;
const RESTFUL_TAIL = /\/[A-Za-z]+\/[A-Za-z0-9.-]{1,64}$/;

export function referenceIdentity(reference: string, sourceFullUrl?: string): string | undefined {
  if (ABSOLUTE_REFERENCE.test(reference)) return reference;
  if (reference.startsWith('#')) return sourceFullUrl ? `${sourceFullUrl}${reference}` : undefined;
  if (
    !RELATIVE_REFERENCE.test(reference) ||
    !sourceFullUrl ||
    !/^https?:\/\//i.test(sourceFullUrl) ||
    !URL.canParse(sourceFullUrl)
  ) {
    return undefined;
  }
  const url = new URL(sourceFullUrl);
  const tail = RESTFUL_TAIL.exec(url.pathname);
  return tail && !url.search && !url.hash && sourceFullUrl.endsWith(tail[0])
    ? `${sourceFullUrl.slice(0, -tail[0].length)}/${reference}`
    : undefined;
}
