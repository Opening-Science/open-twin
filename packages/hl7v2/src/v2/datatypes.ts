import type { CodeableConcept, Coding, HumanName, Identifier } from 'fhir/r4';
import type { EncodingCharacters } from './encoding';
import { component, type Repetition, subcomponent } from './parser';
import { IDENTIFIER_TYPE_SYSTEM, NAME_USE, resolveCodingSystem } from './tables';

export interface DatatypeContext {
  readonly encoding: EncodingCharacters;
  /** System URI for codes whose v2 coding system is local or unstated. */
  readonly localCodeSystem: string;
}

export interface CweResult {
  readonly concept: CodeableConcept;
  /** The codings in message order, so a caller can ask which one is LOINC. */
  readonly codings: readonly Coding[];
  /** True when at least one triplet declared a coding system this connector knows. */
  readonly anyRecognised: boolean;
}

/**
 * CWE (and CE, which is CWE's predecessor with the same first six components) to
 * CodeableConcept.
 *
 * Source: IG datatype map CWE[CodeableConcept] —
 *   CWE.1/.2/.3  -> coding[1].code / .display / .system
 *   CWE.4/.5/.6  -> coding[2] (the alternate coding)
 *   CWE.10/.11/.12 -> coding[3] (the second alternate)
 *   CWE.7/.8/.13 -> coding[n].version
 *   CWE.9        -> text
 *
 * The alternate triplets are the reason this returns every coding rather than one:
 * `1111.2^PHQ-9 Depression Screen PDF^L^44249-1^PHQ-9 quick depression assessment
 * panel^LN` is a local code *and* a LOINC code for the same observation, and a
 * mapper that keeps only the first publishes `1111.2` as if it were the concept.
 */
export function cweToCodeableConcept(rep: Repetition | undefined, context: DatatypeContext): CweResult | undefined {
  if (rep === undefined) return undefined;
  const { encoding, localCodeSystem } = context;

  const triplets: Array<{ code?: string; display?: string; system?: string; version?: string }> = [
    {
      code: component(rep, 1, encoding),
      display: component(rep, 2, encoding),
      system: component(rep, 3, encoding),
      version: component(rep, 7, encoding)
    },
    {
      code: component(rep, 4, encoding),
      display: component(rep, 5, encoding),
      system: component(rep, 6, encoding),
      version: component(rep, 8, encoding)
    },
    {
      code: component(rep, 10, encoding),
      display: component(rep, 11, encoding),
      system: component(rep, 12, encoding),
      version: component(rep, 13, encoding)
    }
  ];

  const codings: Coding[] = [];
  let anyRecognised = false;
  for (const triplet of triplets) {
    if (triplet.code === undefined) continue;
    const resolved = resolveCodingSystem(triplet.system, localCodeSystem);
    anyRecognised ||= resolved.recognised;
    codings.push({
      system: resolved.system,
      code: triplet.code,
      ...(triplet.display ? { display: triplet.display } : {}),
      ...(triplet.version ? { version: triplet.version } : {})
    });
  }

  const text = component(rep, 9, encoding);
  if (codings.length === 0 && text === undefined) return undefined;

  const concept: CodeableConcept = {
    ...(codings.length > 0 ? { coding: codings } : {}),
    ...(text ? { text } : {})
  };
  return { concept, codings, anyRecognised };
}

/** The first coding that sits under `system`, if any. */
export function codingFrom(result: CweResult | undefined, system: string): Coding | undefined {
  return result?.codings.find((coding) => coding.system === system);
}

/**
 * CX to Identifier.
 *
 * Source: IG datatype map CX[Identifier] — CX.1 -> value, CX.5 -> type.coding.code
 * (table 0203), CX.7/.8 -> period.
 *
 * **Deviation, deliberate.** The IG sends CX.4 (assigning authority) to
 * `Identifier.system` only when it already appears in the FHIR identifier registry,
 * and otherwise to an `assigner` Organization; HD[uri] would then take HD.1, a bare
 * namespace name such as `OrdOrg`. `Identifier.system` is the URI of the namespace
 * the value is unique within, so a bare name there is not resolvable by anyone. This
 * connector uses HD.2 with HD.3 = ISO or UUID, which yields the `urn:oid:` /
 * `urn:uuid:` form the IG itself specifies for that case, and otherwise emits no
 * system at all. An identifier with no system is under-specified; an identifier with
 * a system that means something different to each sender is wrong.
 */
export function cxToIdentifier(
  rep: Repetition | undefined,
  context: DatatypeContext,
  report?: ReportMalformedNamespace
): Identifier | undefined {
  if (rep === undefined) return undefined;
  const { encoding } = context;
  const value = component(rep, 1, encoding);
  if (value === undefined) return undefined;

  const identifier: Identifier = { value };

  const system = hdToUri(rep, 4, context, report);
  if (system) identifier.system = system;

  const typeCode = component(rep, 5, encoding);
  if (typeCode) identifier.type = { coding: [{ system: IDENTIFIER_TYPE_SYSTEM, code: typeCode }] };

  return identifier;
}

/**
 * EI to Identifier.
 *
 * Source: IG datatype map EI[Identifier-Extension]. EI is not CX: its assigning
 * authority is EI.2/EI.3/EI.4 laid out flat rather than an HD in a single component,
 * so reading it with the CX rules yields an identifier with no system at all.
 *
 * `type` is supplied by the caller because the meaning comes from the field, not
 * from the datatype: OBR-2 is `PLAC` (placer) and OBR-3 and OBX-21 are `FILL`
 * (filler), each assigned as a literal by the IG's segment maps.
 */
export function eiToIdentifier(
  rep: Repetition | undefined,
  context: DatatypeContext,
  type?: string,
  report?: ReportMalformedNamespace
): Identifier | undefined {
  if (rep === undefined) return undefined;
  const value = component(rep, 1, context.encoding);
  if (value === undefined) return undefined;

  const system = namespaceUri(component(rep, 3, context.encoding), component(rep, 4, context.encoding), report);

  return {
    ...(type ? { type: { coding: [{ system: IDENTIFIER_TYPE_SYSTEM, code: type }] } } : {}),
    ...(system ? { system } : {}),
    value
  };
}

export type ReportMalformedNamespace = () => void;

/**
 * FHIR R4 constrains `urn:oid:` to `[0-2](\.(0|[1-9][0-9]*))+` and the HL7 validator
 * enforces it: an OID whose first arc is above 2 is not an OID, and a resource
 * carrying one is rejected outright.
 *
 * This is not hypothetical. The v2-to-FHIR IG's own ORU_R01 example declares the
 * assigning authorities `3.4.5.6.7` and `8.7.6.4` as ISO universal ids, and both are
 * malformed. Emitting them anyway produced two validator errors; emitting no system
 * produces an identifier that is merely less specific than the sender intended.
 */
const OID = /^[0-2](\.(0|[1-9]\d*))+$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function namespaceUri(
  universalId: string | undefined,
  universalIdType: string | undefined,
  report?: ReportMalformedNamespace
): string | undefined {
  if (universalId === undefined) return undefined;
  if (universalIdType === 'ISO') {
    if (OID.test(universalId)) return `urn:oid:${universalId}`;
    report?.();
    return undefined;
  }
  if (universalIdType === 'UUID') {
    if (UUID.test(universalId)) return `urn:uuid:${universalId.toLowerCase()}`;
    report?.();
    return undefined;
  }
  // Any other universal-id type — including the `GUID` some senders use — has no
  // URI form defined by the IG, so there is nothing to emit.
  return undefined;
}

/**
 * HD to uri, restricted to the two universal-id types that produce a global URI.
 * Source: IG datatype map HD[uri] (`"urn:oid:" + HD.2` when HD.3 = ISO,
 * `"urn:uuid:" + HD.2` when HD.3 = UUID).
 */
export function hdToUri(
  rep: Repetition | undefined,
  componentIndex: number,
  context: DatatypeContext,
  report?: ReportMalformedNamespace
): string | undefined {
  return namespaceUri(
    subcomponent(rep, componentIndex, 2, context.encoding),
    subcomponent(rep, componentIndex, 3, context.encoding),
    report
  );
}

/**
 * XPN to HumanName.
 *
 * Source: IG datatype map XPN[HumanName] — XPN.1 -> family, XPN.2 -> given[1],
 * XPN.3 -> given[2], XPN.4 -> suffix[1], XPN.5 -> prefix, XPN.6 -> suffix[2],
 * XPN.7 -> use (table 0200), XPN.14 -> suffix[3].
 *
 * XPN.3 is left as a single `given` entry. The IG raises the question of whether
 * "Mary Anne" in XPN.3 is one given name or two and does not answer it; splitting on
 * a space would silently invent a name boundary, so the sender's own grouping stands.
 */
export function xpnToHumanName(rep: Repetition | undefined, context: DatatypeContext): HumanName | undefined {
  if (rep === undefined) return undefined;
  const { encoding } = context;

  // XPN.1 is FN, whose first subcomponent is the surname proper.
  const family = subcomponent(rep, 1, 1, encoding);
  const given = [component(rep, 2, encoding), component(rep, 3, encoding)].filter(
    (value): value is string => value !== undefined
  );
  const prefix = component(rep, 5, encoding);
  const suffix = [component(rep, 4, encoding), component(rep, 6, encoding), component(rep, 14, encoding)].filter(
    (value): value is string => value !== undefined
  );
  const nameTypeCode = component(rep, 7, encoding);
  const use = nameTypeCode === undefined ? undefined : NAME_USE[nameTypeCode];

  if (family === undefined && given.length === 0 && suffix.length === 0 && prefix === undefined) return undefined;

  return {
    ...(use ? { use: use as HumanName['use'] } : {}),
    ...(family ? { family } : {}),
    ...(given.length > 0 ? { given } : {}),
    ...(prefix ? { prefix: [prefix] } : {}),
    ...(suffix.length > 0 ? { suffix } : {})
  };
}
