/**
 * WHAT: Shared, reviewed LOINC codings emitted by more than one connector.
 * NOT:  Must not invent terminology or attach anatomy, interpretation, or units.
 * GOVERNED BY: DECISIONS.md#d3; DECISIONS.md#d4; verify/terminology-allowlist.json
 * CORRECTNESS: Signed terminology review records for every code in this table.
 */
import type { CodingInput } from './observation';
import { SYSTEMS } from './systems';

export const LOINC_CODINGS = {
  HEART_RATE: { system: SYSTEMS.LOINC, code: '8867-4', display: 'Heart rate' },
  /**
   * Oura historically omitted this optional display while WHOOP emitted the
   * reviewed Long Common Name. Keep the shared coding display-free so extracting
   * the duplicate does not change either connector's output; WHOOP adds its
   * reviewed display at the mapper boundary.
   */
  OXYGEN_SATURATION: { system: SYSTEMS.LOINC, code: '59408-5' },
  TIME_IN_BED: { system: SYSTEMS.LOINC, code: '103213-5', display: 'Duration in bed' }
} as const satisfies Record<string, CodingInput>;
