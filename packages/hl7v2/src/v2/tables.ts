/**
 * WHAT: HL7 v2 parse/datatype/encoding helpers.
 * NOT:  Must not invent FHIR codings; fhir/ and tables own clinical mapping.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: HL7 v2 encoding rules; golden fixtures from HL7 v2-to-FHIR IG where used.
 */
import { SYSTEMS } from '@open-twin/fhir-core';

/**
 * Vocabulary maps taken from the HL7 Version 2 to FHIR Implementation Guide.
 *
 * Every table below is transcribed from the IG's own ConceptMap CSVs at
 * https://github.com/HL7/v2-to-fhir/tree/master/mappings/codesystems, cited per
 * table. Where the IG leaves a source code unmapped, this file leaves it unmapped
 * too: a v2 code with no FHIR target is reported, never guessed at. Guessing is how
 * a "verified" result becomes a "final" one.
 */

/**
 * The Foundation-controlled namespace for codes whose v2 coding system is local.
 *
 * D3: a code system URI you do not control is not a code system. A v2 sender's
 * local codes (HL7 table 0396 `99zzz`, or `L`, or no coding system at all) have no
 * published URI by definition, so they land here rather than under `http://loinc.org`
 * where they would be read as LOINC codes that do not exist.
 *
 * Local codes from two different sending systems are *different* codes that may
 * collide on their identifier. Callers who exchange with more than one sender should
 * pass their own `localCodeSystem` per sender.
 */
export const HL7V2_LOCAL_SYSTEM = 'http://opentwin.ch/fhir/CodeSystem/hl7v2-local';

/**
 * HL7 table 0396 "Coding System" to FHIR canonical URI.
 *
 * The IG's CWE[CodeableConcept] map sends CWE.3 to `Coding.system` but says only
 * that "the vocabulary table will give the actual uri" — it publishes no such table.
 * These four are the ones this connector can verify against a primary source:
 *
 *   LN   -> http://loinc.org             table 0396 "Logical Observation Identifier
 *                                        Names and Codes (LOINC®)"; canonical URI
 *                                        from FHIR R4 "Using Codes in Resources".
 *   SCT  -> http://snomed.info/sct       table 0396 "SNOMED Clinical Terms"; same.
 *   UCUM -> http://unitsofmeasure.org    table 0396 "UCUM code set for units of
 *                                        measure (from Regenstrief)"; same.
 *   HL7nnnn                              HL7-defined v2 tables, published by HL7
 *                                        Terminology as .../CodeSystem/v2-nnnn. The
 *                                        form is taken from the IG's own segment
 *                                        maps, which assign literals such as
 *                                        "http://terminology.hl7.org/CodeSystem/v2-0203".
 *
 * Deliberately absent: `SNM` and `SNM3`. Table 0396 defines them as SNOMED 2nd
 * edition and SNOMED International 1993 — different code systems from SNOMED CT,
 * with different identifiers. Mapping them onto `http://snomed.info/sct` would
 * publish a code that does not exist there under a system that says it does.
 */
const CODING_SYSTEMS: Readonly<Record<string, string>> = {
  LN: SYSTEMS.LOINC,
  SCT: SYSTEMS.SNOMED,
  UCUM: SYSTEMS.UCUM
};

const HL7_TABLE = /^HL7(\d{4})$/;

export interface ResolvedSystem {
  readonly system: string;
  /** False when the v2 coding system was local, unknown, or simply not stated. */
  readonly recognised: boolean;
}

/**
 * Resolves CWE.3 / CWE.6 / CWE.12 (name of coding system) to a system URI.
 *
 * This is the single most consequential decision the connector makes. `4548-4` under
 * `http://loinc.org` is haemoglobin A1c to every FHIR consumer on earth; the same
 * digits emitted by a laboratory's local dictionary mean whatever that laboratory
 * decided. Publishing the second as the first is not a formatting problem.
 */
export function resolveCodingSystem(name: string | undefined, localSystem: string): ResolvedSystem {
  if (name === undefined) return { system: localSystem, recognised: false };

  const direct = CODING_SYSTEMS[name];
  if (direct !== undefined) return { system: direct, recognised: true };

  const table = HL7_TABLE.exec(name);
  if (table) return { system: `http://terminology.hl7.org/CodeSystem/v2-${table[1]}`, recognised: true };

  // Includes `L`, `99zzz` (table 0396: "Local general code where z is an
  // alphanumeric character") and anything this connector cannot verify.
  return { system: localSystem, recognised: false };
}

/**
 * HL7 table 0001 Administrative Sex to FHIR administrative-gender.
 *
 * Source: IG ConceptMap `table-hl70001-to-administrative-gender`, verified against
 * both the published ConceptMap page and the FSH source. `A` (Ambiguous) and `N`
 * (Not applicable) map to `other`, which is the IG's choice, not this connector's.
 *
 * `Patient.gender` has a *required* binding, so an unrecognised v2 code cannot be
 * passed through — it would make the resource invalid. It is reported instead.
 */
export const ADMINISTRATIVE_GENDER: Readonly<Record<string, 'male' | 'female' | 'other' | 'unknown'>> = {
  F: 'female',
  M: 'male',
  O: 'other',
  U: 'unknown',
  A: 'other',
  N: 'other'
};

/**
 * HL7 table 0085 Observation Result Status to FHIR observation-status.
 *
 * Source: IG ConceptMap `ObservationResultStatusCodesInterpretation`. The IG maps
 * only A, C, D, F, P, W and X; B, I, N, O, R, S, U and V are left without a target
 * and are *not* invented here. `Observation.status` is required, so an unmapped code
 * yields `unknown` — the code that says exactly "we do not know the status" — and an
 * issue. Mapping `R` (entered, not verified) to `preliminary` would be a clinical
 * assertion this connector is not entitled to make.
 */
export const OBSERVATION_STATUS: Readonly<Record<string, string>> = {
  A: 'amended',
  C: 'corrected',
  D: 'entered-in-error',
  F: 'final',
  P: 'preliminary',
  W: 'entered-in-error',
  X: 'cancelled'
};

/**
 * HL7 table 0123 Result Status to FHIR diagnostic-report-status.
 * Source: IG ConceptMap `ResultStatus[Non-Queries]`. A, M, N, Y and Z are unmapped
 * in the IG and stay unmapped here.
 */
export const DIAGNOSTIC_REPORT_STATUS: Readonly<Record<string, string>> = {
  O: 'registered',
  I: 'registered',
  S: 'registered',
  P: 'preliminary',
  C: 'corrected',
  R: 'partial',
  F: 'final',
  X: 'cancelled'
};

/**
 * HL7 table 0200 Name Type to FHIR name-use.
 * Source: IG ConceptMap `NameType`. A, B, C, F, I, K, NB, NOUSE, P, REL, S, T and U
 * have no FHIR target in the IG; a name carrying one of those is emitted without a
 * `use`, which is valid and honest.
 */
export const NAME_USE: Readonly<Record<string, string>> = {
  BAD: 'old',
  D: 'usual',
  L: 'official',
  M: 'maiden',
  MSK: 'anonymous',
  N: 'nickname',
  NAV: 'temp',
  R: 'official',
  TEMP: 'temp'
};

/**
 * HL7 table 0004 Patient Class to `Encounter.class` and `Encounter.status`.
 * Source: IG ConceptMaps `PatientClass[EncounterClass]` and
 * `PatientClass[EncounterStatus]`. Note that R, B, C, N and U stay in the v2 code
 * system rather than moving to v3 ActCode — that too is the IG's mapping.
 */
export const ENCOUNTER_CLASS: Readonly<Record<string, { code: string; system: string; display: string }>> = {
  E: { code: 'EMER', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', display: 'emergency' },
  I: { code: 'IMP', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', display: 'inpatient encounter' },
  O: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', display: 'ambulatory' },
  P: { code: 'PRENC', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', display: 'pre-admission' },
  R: { code: 'R', system: 'http://terminology.hl7.org/CodeSystem/v2-0004', display: 'Recurring patient' },
  B: { code: 'B', system: 'http://terminology.hl7.org/CodeSystem/v2-0004', display: 'Obstetrics' },
  C: { code: 'C', system: 'http://terminology.hl7.org/CodeSystem/v2-0004', display: 'Commercial Account' },
  N: { code: 'N', system: 'http://terminology.hl7.org/CodeSystem/v2-0004', display: 'Not Applicable' },
  U: { code: 'U', system: 'http://terminology.hl7.org/CodeSystem/v2-0004', display: 'Unknown' }
};

export const ENCOUNTER_STATUS: Readonly<Record<string, string>> = {
  E: 'in-progress',
  I: 'in-progress',
  O: 'in-progress',
  P: 'planned',
  R: 'in-progress',
  B: 'in-progress',
  C: 'in-progress',
  N: 'in-progress',
  U: 'unknown'
};

/**
 * The LOINC codes in FHIR R4's vital-signs value set,
 * `http://hl7.org/fhir/ValueSet/observation-vitalsignresult` version 4.0.1,
 * transcribed from the published JSON.
 *
 * These are not codes this connector chooses to emit — they arrive in OBX-3. The
 * set exists because the R4 vital-signs profiles **auto-apply** to an Observation
 * carrying one of them, whether or not the resource claims the profile, and those
 * profiles make `category` (sliced to vital-signs) and `effective[x]` mandatory.
 * Emitting an Observation for a body height without a category is therefore not a
 * looser resource; it is an invalid one, and the HL7 validator says so.
 *
 * Note what this set is *not* used for: it never adds, replaces or reinterprets a
 * code. A local code that happens to read `8302-2` is not in this set, because the
 * lookup is on the LOINC coding, not on the digits.
 */
export const VITAL_SIGNS_LOINC: ReadonlySet<string> = new Set([
  '85353-1',
  '9279-1',
  '8867-4',
  '2708-6',
  '8310-5',
  '8302-2',
  '9843-4',
  '29463-7',
  '39156-5',
  '85354-9',
  '8480-6',
  '8462-4',
  '8478-0'
]);

export const IDENTIFIER_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v2-0203';
export const OBSERVATION_INTERPRETATION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';

/**
 * HL7 table 0078 Interpretation Codes to v3 ObservationInterpretation.
 *
 * Source: IG ConceptMap `InterpretationCodes`. Every mapping in that table is an
 * identity mapping onto the v3 code system, so the set below is the set of *source*
 * codes the IG gives a target for. Codes the IG marks inactive in the target value
 * set (AC, HM, MS, OBX, QCF, TOX, VS) are excluded: `Observation.interpretation` is
 * bound to a value set that no longer contains them.
 */
export const INTERPRETATION_CODES: ReadonlySet<string> = new Set([
  '<',
  '>',
  'A',
  'AA',
  'B',
  'CAR',
  'D',
  'DET',
  'E',
  'EX',
  'EXP',
  'H',
  'HH',
  'HU',
  'I',
  'IE',
  'IND',
  'L',
  'LL',
  'LU',
  'N',
  'NCL',
  'ND',
  'NEG',
  'NR',
  'NS',
  'POS',
  'R',
  'RR',
  'S',
  'SDD',
  'SYN-R',
  'SYN-S',
  'U',
  'UNE',
  'W',
  'WR'
]);

/**
 * HL7 table 0125 Value Type, as of v2.9.
 *
 * Used for one purpose: deciding whether an OBX-2 code may appear in a reported
 * issue. A member of a closed HL7 vocabulary is not patient data, so naming it makes
 * the issue actionable; anything else is unrecognised free text from a message that
 * belongs to a person, and is never echoed.
 */
const VALUE_TYPES: ReadonlySet<string> = new Set([
  'AD',
  'CE',
  'CF',
  'CK',
  'CN',
  'CNE',
  'CP',
  'CWE',
  'CX',
  'DR',
  'DT',
  'DTM',
  'ED',
  'EI',
  'FT',
  'ID',
  'IS',
  'MA',
  'MO',
  'NA',
  'NM',
  'PN',
  'RP',
  'SN',
  'ST',
  'TM',
  'TN',
  'TS',
  'TX',
  'VR',
  'XAD',
  'XCN',
  'XON',
  'XPN',
  'XTN'
]);

export function knownValueType(raw: string | undefined): string | undefined {
  return raw !== undefined && VALUE_TYPES.has(raw) ? raw : undefined;
}
