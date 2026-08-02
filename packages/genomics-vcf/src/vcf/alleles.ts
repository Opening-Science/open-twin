/**
 * WHAT: Parses VCF structures (header, records, genotype, coordinates).
 * NOT:  Must not emit FHIR resources; fhir/ owns mapping.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: VCF specification parsing; fixtures from public htsjdk/dbSNP where applicable.
 */
export type AltKind = 'sequence' | 'symbolic' | 'breakend' | 'spanning-deletion' | 'invalid';

export function classifyAlt(alt: string): AltKind {
  if (alt === '*') return 'spanning-deletion';
  if (alt.startsWith('<')) return 'symbolic';
  if (alt.includes('[') || alt.includes(']')) return 'breakend';
  if (/^[ACGTNacgtn]+$/.test(alt)) return 'sequence';
  return 'invalid';
}
