/**
 * WHAT: Defines aggregate's source attribution and connector identity.
 * NOT:  Does not resolve measurements or choose sources.
 * GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d19
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { CONNECTOR_TAG_SYSTEM, ConnectorError } from '@open-twin/fhir-core';
import type { Bundle } from 'fhir/r4.js';

export const AGGREGATOR = { connector: 'open-twin', version: '0.1.0' } as const;

export interface SourceBundle {
  /** The connector that produced it. Read from meta.tag when not given. */
  connector?: string;
  bundle: Bundle;
}

export function connectorOf(source: SourceBundle): string {
  const tagged = source.bundle.meta?.tag?.find((tag) => tag.system === CONNECTOR_TAG_SYSTEM)?.code;
  const connector = source.connector ?? tagged;
  if (!connector) {
    throw new ConnectorError('Cannot attribute a bundle: it carries no connector tag and none was supplied', {
      code: 'validation',
      connector: AGGREGATOR.connector,
      operation: 'aggregate'
    });
  }
  return connector;
}
