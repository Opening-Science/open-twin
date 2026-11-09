/**
 * WHAT: withConnectorTag: a bundle with the connector meta tag on every entry, for providers whose mappers tag the Bundle only (#238).
 * NOT:  Changes no id, timestamp or order, and keeps every other tag.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d2
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: a tag with the same connector code is replaced, so the version on every entry is the reader's.
 */
import { CONNECTOR_TAG_SYSTEM, connectorMeta } from '@open-twin/fhir-core';
import type { Bundle, FhirResource } from 'fhir/r4';

export function withConnectorTag(bundle: Bundle, connector: { connector: string; version: string }): Bundle {
  const tag = connectorMeta(connector).tag ?? [];
  const entry = (bundle.entry ?? []).map((item) => {
    if (!item.resource) return item;

    const others = (item.resource.meta?.tag ?? []).filter(
      (t) => !(t.system === CONNECTOR_TAG_SYSTEM && t.code === connector.connector)
    );
    const meta = { ...(item.resource.meta ?? {}), tag: [...others, ...tag] };
    return { ...item, resource: { ...item.resource, meta } as FhirResource };
  });
  return { ...bundle, entry };
}
