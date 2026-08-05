/**
 * WHAT: UCUM validation / quantity helpers for this package.
 * NOT:  Must not invent unit codes; invalid UCUM fails closed.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: UCUM grammar via @lhncbc/ucum-lhc.
 */
import { UcumLhcUtils, type UcumLhcUtilsInstance } from '@lhncbc/ucum-lhc';

/**
 * UCUM validation and conversion, delegated to the published UCUM grammar.
 *
 * A hand-maintained list of acceptable units is the same class of artefact as the
 * defects it is meant to catch: it encodes what someone believed, not what UCUM
 * defines. That matters more here than anywhere else in this repository, because a
 * vendor API sends a unit chosen once at integration time whereas an HL7 v2 message
 * sends whatever string the sending laboratory's dictionary happens to hold.
 */

let cachedUtils: UcumLhcUtilsInstance | undefined;

function utils(): UcumLhcUtilsInstance {
  // The library builds its unit tables on first use; deferring that keeps the cost
  // out of module load for callers that never see a unit.
  //
  // The named import, not the default. `@lhncbc/ucum-lhc` is CommonJS with no
  // `exports` map, and the default import resolves to `undefined` under some ES
  // module loaders while `exports.UcumLhcUtils` is detected by all of them. This is
  // also the form `verify/check-units.mjs` uses.
  cachedUtils ??= UcumLhcUtils.getInstance();
  return cachedUtils;
}

const validity = new Map<string, boolean>();

export function isValidUcum(code: string): boolean {
  const cached = validity.get(code);
  if (cached !== undefined) return cached;
  const valid = utils().validateUnitString(code, false).status === 'valid';
  validity.set(code, valid);
  return valid;
}

/**
 * Converts a value between two UCUM units, or returns undefined when the units are
 * not commensurable.
 *
 * Undefined is a finding, not a nuisance: it means the message carries a unit whose
 * dimension disagrees with the unit its own observation code requires — a height in
 * kilograms — and the right response is to refuse the value, not to publish the
 * number under whichever unit looked more official.
 */
export function convertUcum(from: string, value: number, to: string): number | undefined {
  if (from === to) return value;
  const result = utils().convertUnitTo(from, value, to, false);
  if (result.status !== 'succeeded' || result.toVal === undefined || result.toVal === null) return undefined;
  if (!Number.isFinite(result.toVal)) return undefined;
  // Binary floating point turns 1.9 m into 190.00000000000003 cm often enough to
  // matter in a printed report. Twelve significant digits is far beyond the
  // precision of any clinical measurement and removes the artefact.
  return Number(result.toVal.toPrecision(12));
}
