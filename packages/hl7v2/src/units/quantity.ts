import { LOINC_UNITS, quantity, SYSTEMS } from '@open-twin/fhir-core';
import type { Quantity } from 'fhir/r4';
import { convertUcum, isValidUcum } from './ucum';

/**
 * OBX-5 plus OBX-6 to a FHIR Quantity.
 *
 * This lives outside `src/fhir/` on purpose. `verify/check-units.mjs` reviews the
 * `(unit, code)` pairs written as literals in the mappers, which is the right gate
 * for a connector whose units are fixed at integration time. An HL7 v2 unit is not a
 * literal — it arrives in the message — so the review that gate performs is
 * performed here instead, at run time, against the UCUM grammar itself. Putting the
 * construction in `src/fhir/` would report a code the gate cannot read and would
 * teach the next reader that the gate had approved something.
 */

export type QuantityResult =
  /** A UCUM-coded Quantity. `converted` is set when the value was rescaled (D4). */
  | { readonly kind: 'ok'; readonly quantity: Quantity; readonly converted: boolean }
  /** OBX-6 was absent. The number stands; nothing claims to know its unit. */
  | { readonly kind: 'no-unit'; readonly quantity: Quantity }
  /** OBX-6 held something that is not a UCUM expression. */
  | { readonly kind: 'invalid-unit' }
  /** OBX-6 is valid UCUM but disagrees dimensionally with what OBX-3's code requires. */
  | { readonly kind: 'incommensurable' };

export interface QuantityInput {
  readonly value: number;
  /** OBX-6.1, or OBX-6.4 when the alternate triplet is the UCUM one. */
  readonly unitCode?: string;
  /** OBX-6.2, the sender's human-readable unit name. */
  readonly unitDisplay?: string;
  /** OBX-3's LOINC code, when it has one. Drives the D4 canonical unit. */
  readonly loincCode?: string;
}

export function toQuantity(input: QuantityInput): QuantityResult {
  const { value, unitCode, unitDisplay, loincCode } = input;

  if (unitCode === undefined) {
    return { kind: 'no-unit', quantity: { value } };
  }

  // Reject rather than pass through. `unit: 'centimeter'` with no `code` looks
  // harmless and is unusable; `code: 'centimeter'` under the UCUM system is a claim
  // about UCUM that UCUM does not honour, and a validating server rejects the whole
  // resource — after it has already been stored elsewhere unvalidated.
  if (!isValidUcum(unitCode)) return { kind: 'invalid-unit' };

  const canonical = loincCode === undefined ? undefined : LOINC_UNITS[loincCode];

  if (canonical === undefined || canonical.code === unitCode) {
    return {
      kind: 'ok',
      converted: false,
      quantity: {
        value,
        unit: unitDisplay ?? unitCode,
        system: SYSTEMS.UCUM,
        code: unitCode
      }
    };
  }

  // D4: one unit per concept, across every connector. A height sent as `m` and a
  // height sent as `cm` under the same LOINC code cannot both be published as-is or
  // the two are incomparable — which is the whole reason the shared table exists.
  const converted = convertUcum(unitCode, value, canonical.code);
  if (converted === undefined) return { kind: 'incommensurable' };

  const result = quantity(converted, canonical);
  // `quantity` only returns undefined for a non-finite value, which convertUcum has
  // already excluded; the branch exists so the type is honest rather than asserted.
  if (result === undefined) return { kind: 'incommensurable' };
  return { kind: 'ok', converted: true, quantity: result };
}
