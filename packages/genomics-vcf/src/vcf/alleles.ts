/**
 * What kind of thing an ALT entry is (hts-specs §1.4.1, the ALT field and §5 on
 * symbolic and breakend alleles).
 *
 * Only `sequence` is in scope. The rest are named individually rather than lumped
 * into "unsupported" so the OperationOutcome can say *which* out-of-scope construct
 * a file leans on — the difference between "this caller sends structural variants"
 * and "this caller sends gVCF" changes what would have to be built next.
 */
export type AltKind = 'sequence' | 'symbolic' | 'breakend' | 'spanning-deletion' | 'invalid';

export function classifyAlt(alt: string): AltKind {
  if (alt === '*') return 'spanning-deletion';
  if (alt.startsWith('<')) return 'symbolic';
  if (alt.includes('[') || alt.includes(']')) return 'breakend';
  if (/^[ACGTNacgtn]+$/.test(alt)) return 'sequence';
  return 'invalid';
}
