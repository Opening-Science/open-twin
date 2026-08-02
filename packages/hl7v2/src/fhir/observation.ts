/**
 * WHAT: Maps HL7 v2 segments into FHIR resources.
 * NOT:  Must not invent LOINC/SNOMED beyond allowlisted/table-driven mappings.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: HL7 v2-to-FHIR IG expectations; signed review record for coded Observations; HL7 validator on emitted bundles.
 */
import {
  CATEGORY,
  codeableConcept,
  createObservation,
  dataAbsentReason,
  deterministicId,
  SYSTEMS
} from '@open-twin/fhir-core';
import type { Annotation, CodeableConcept, Observation, Reference } from 'fhir/r4';
import type { IssueLog } from '../issues';
import { toQuantity } from '../units/quantity';
import { codingFrom, cweToCodeableConcept, type DatatypeContext, eiToIdentifier } from '../v2/datatypes';
import { parseV2DateTime } from '../v2/datetime';
import { component, field, repetition, repetitions, type Segment } from '../v2/parser';
import {
  INTERPRETATION_CODES,
  knownValueType,
  OBSERVATION_INTERPRETATION_SYSTEM,
  OBSERVATION_STATUS,
  VITAL_SIGNS_LOINC
} from '../v2/tables';

/**
 * OBX to Observation.
 *
 * Source: IG segment map OBX[Observation]. Implemented here:
 *   OBX-2  determines which `value[x]` is used (see below)
 *   OBX-3  -> code            (CWE[CodeableConcept])
 *   OBX-5  -> value[x]
 *   OBX-6  -> valueQuantity.unit/system/code, for the numeric types
 *   OBX-7  -> referenceRange.text
 *   OBX-8  -> interpretation  (CWE[CodeableConcept], InterpretationCodes)
 *   OBX-11 -> status          (ObservationResultStatusCodesInterpretation)
 *   OBX-14 -> effectiveDateTime
 *   OBX-17 -> method
 *   OBX-20 -> bodySite
 *   OBX-21 -> identifier
 *   NTE    -> note            (IG NTE[Observation]: NTE-3 -> note.text, NTE-6 -> note.time)
 */

export interface ObservationContext {
  readonly datatypes: DatatypeContext;
  readonly connector: string;
  readonly subjectKey: string;
  readonly messageControlId: string;
  readonly subject: Reference;
  readonly encounter?: Reference;
}

/**
 * The OBX-2 value types this connector maps, and what each becomes.
 *
 * Source: the OBX-5 rows of the IG's OBX[Observation] map, which are conditioned on
 * OBX-2 exactly this way. `TS` is v2.3/2.4's name for what later versions call
 * `DTM`; both mean the same timestamp and both are accepted.
 */
const VALUE_TYPES = {
  NM: 'quantity',
  ST: 'string',
  TX: 'string',
  FT: 'string',
  CE: 'concept',
  CWE: 'concept',
  CF: 'concept',
  CNE: 'concept',
  IS: 'concept',
  DT: 'dateTime',
  DTM: 'dateTime',
  TS: 'dateTime'
} as const;

export function obxToObservation(
  segment: Segment,
  notes: readonly Segment[],
  context: ObservationContext,
  issues: IssueLog
): Observation {
  const { datatypes } = context;
  const encoding = datatypes.encoding;
  const at = { segment: segment.name, position: segment.position };

  const identifier = cweToCodeableConcept(repetition(segment, 3), datatypes);
  const code: CodeableConcept = identifier?.concept ?? {
    text: 'Unidentified HL7 v2 observation'
  };
  if (identifier === undefined) {
    // OBX-3 is 1..1 in v2 and `Observation.code` is 1..1 in FHIR. A message that
    // omits it describes a result nobody can interpret.
    issues.add('OBX-3 is empty, so the observation has no identifiable code', 'validation', { ...at, field: 'OBX-3' });
  }

  // The LOINC coding, if the sender declared one. `LN` in OBX-3.3 (or in the
  // alternate triplet OBX-3.6) is what makes a code LOINC; digits that look like a
  // LOINC code are not LOINC, and publishing a local code under http://loinc.org
  // hands the receiver a concept definition the sender never asserted.
  const loincCode = codingFrom(identifier, SYSTEMS.LOINC)?.code;

  const statusCode = field(segment, 11, 1, encoding);
  const status = statusCode === undefined ? undefined : OBSERVATION_STATUS[statusCode];
  if (status === undefined) {
    // `Observation.status` is 1..1 and required-bound. `unknown` is the only member
    // of the value set that does not assert something about the result, and OBX-11
    // is mandatory in v2, so reaching this branch always means something is wrong
    // with the message rather than merely unstated.
    issues.add(
      statusCode === undefined
        ? 'OBX-11 is absent although it is required in HL7 v2; status recorded as unknown'
        : 'OBX-11 carries a result status with no mapping in HL7 table 0085; status recorded as unknown',
      statusCode === undefined ? 'validation' : 'unsupported',
      { ...at, field: 'OBX-11' }
    );
  }

  const effective = parseV2DateTime(field(segment, 14, 1, encoding));
  const isVitalSign = loincCode !== undefined && VITAL_SIGNS_LOINC.has(loincCode);

  const observation = createObservation({
    id: observationId(segment, context),
    code: [],
    subject: context.subject,
    ...(effective.ok ? { effectiveDateTime: effective.parsed.value } : {}),
    // The R4 vital-signs profiles auto-apply to their LOINC codes and make the
    // vital-signs category mandatory, so this is the profile's requirement rather
    // than a classification this connector is choosing to assert.
    ...(isVitalSign ? { category: CATEGORY.VITAL_SIGNS } : {})
  });

  if (!effective.ok && isVitalSign) {
    // Those same profiles make `effective[x]` mandatory, and OBX-14 is optional in
    // v2 — the IG's own ADT_A01 example omits it. FHIR's answer to a required
    // element whose value is genuinely unknown is the element carrying a
    // data-absent-reason and no value. Substituting MSH-7 would assert that the
    // height was measured when the message happened to be sent.
    //
    // It is a `Period` rather than a `dateTime` because of the vital-signs
    // invariant vs-1, "if Observation.effective[x] is dateTime and has a value then
    // that value shall be precise to the day". Its FHIRPath is
    // `($this as dateTime).empty() or ($this as dateTime).toString().length() >= 8`,
    // and a value-less `dateTime` is not `empty()` while its `toString()` is — so
    // the honest data-absent-reason fails the invariant on that type and passes on
    // this one. Found by running the HL7 validator, not by reading the profile.
    observation.effectivePeriod = {
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
          valueCode: 'unknown'
        }
      ]
    };
  }

  // `createObservation` builds the CodeableConcept from CodingInputs, which cannot
  // express the version and text a CWE carries, so the concept assembled above wins.
  observation.code = code;
  if (status) observation.status = status as Observation['status'];
  else observation.status = 'unknown';

  const instanceId = eiToIdentifier(repetition(segment, 21), datatypes, 'FILL', () => {
    issues.add(
      'OBX-21 declares a namespace whose universal ID is not a valid OID or UUID; the identifier has no system',
      'validation',
      { ...at, field: 'OBX-21' }
    );
  });
  if (instanceId) observation.identifier = [instanceId];

  if (context.encounter) observation.encounter = context.encounter;

  applyValue(segment, observation, { loincCode, context, issues });

  const referenceRange = field(segment, 7, 1, encoding);
  if (referenceRange) observation.referenceRange = [{ text: referenceRange }];

  const interpretations = repetitions(segment, 8)
    .map((rep) => interpretation(component(rep, 1, encoding), component(rep, 2, encoding)))
    .filter((concept) => concept !== undefined);
  if (interpretations.length > 0) observation.interpretation = interpretations;

  const method = cweToCodeableConcept(repetition(segment, 17), datatypes);
  if (method) observation.method = method.concept;

  const bodySite = cweToCodeableConcept(repetition(segment, 20), datatypes);
  if (bodySite) observation.bodySite = bodySite.concept;

  const annotations = notes.map((note) => noteFrom(note, datatypes)).filter((annotation) => annotation !== undefined);
  if (annotations.length > 0) observation.note = annotations;

  return observation;
}

function observationId(segment: Segment, context: ObservationContext): string {
  const instance = field(segment, 21, 1, context.datatypes.encoding);
  const setId = field(segment, 1, 1, context.datatypes.encoding);
  return deterministicId({
    connector: context.connector,
    subjectKey: context.subjectKey,
    recordId: instance ?? context.messageControlId,
    // The set id alone is not unique across a message with several OBR groups, so
    // the segment's own position disambiguates. Both are stable for a given message.
    measure: instance ? 'obx' : `obx-${setId ?? 'x'}-${segment.position}`
  });
}

function applyValue(
  segment: Segment,
  observation: Observation,
  options: { loincCode?: string; context: ObservationContext; issues: IssueLog }
): void {
  const { context, issues, loincCode } = options;
  const encoding = context.datatypes.encoding;
  const at = { segment: segment.name, position: segment.position };

  const rawType = field(segment, 2, 1, encoding);
  const kind = rawType === undefined ? undefined : VALUE_TYPES[rawType as keyof typeof VALUE_TYPES];
  const values = repetitions(segment, 5);

  if (kind === undefined) {
    // The requirement is that an unsupported type is *reported*, not that it is
    // approximated. Rendering an SN (structured numeric such as `<0.10`) as the
    // string "0.10", or an NA (numeric array) as its first element, produces a
    // result that is well-formed, plausible and wrong.
    const known = knownValueType(rawType);
    issues.add(
      known
        ? `OBX-2 value type ${known} is not supported by this connector`
        : 'OBX-2 carries a value type that is not in HL7 table 0125',
      'unsupported',
      { ...at, field: 'OBX-2' }
    );
    observation.dataAbsentReason = dataAbsentReason('unknown');
    return;
  }

  if (values.length === 0) {
    observation.dataAbsentReason = dataAbsentReason('unknown');
    return;
  }

  if (values.length > 1) {
    // The IG routes a repeating OBX-5 to Observation.component via a separate map
    // (OBX[Observation-Component]) which this connector does not implement. Taking
    // the first repetition and dropping the rest would silently discard results.
    issues.add('OBX-5 repeats; this connector does not implement the OBX[Observation-Component] map', 'unsupported', {
      ...at,
      field: 'OBX-5'
    });
    observation.dataAbsentReason = dataAbsentReason('unknown');
    return;
  }

  const first = values[0];

  switch (kind) {
    case 'string': {
      const text = component(first, 1, encoding);
      if (text === undefined) observation.dataAbsentReason = dataAbsentReason('unknown');
      else observation.valueString = text;
      return;
    }
    case 'concept': {
      const concept = cweToCodeableConcept(first, context.datatypes);
      if (concept === undefined) observation.dataAbsentReason = dataAbsentReason('unknown');
      else observation.valueCodeableConcept = concept.concept;
      return;
    }
    case 'dateTime': {
      const parsed = parseV2DateTime(component(first, 1, encoding));
      if (!parsed.ok) {
        issues.add('OBX-5 is not a valid HL7 v2 date/time for the declared value type', 'validation', {
          ...at,
          field: 'OBX-5'
        });
        observation.dataAbsentReason = dataAbsentReason('error');
        return;
      }
      observation.valueDateTime = parsed.parsed.value;
      return;
    }
    case 'quantity': {
      applyQuantity(segment, observation, { loincCode, context, issues });
      return;
    }
  }
}

function applyQuantity(
  segment: Segment,
  observation: Observation,
  options: { loincCode?: string; context: ObservationContext; issues: IssueLog }
): void {
  const { context, issues, loincCode } = options;
  const encoding = context.datatypes.encoding;
  const at = { segment: segment.name, position: segment.position };

  const raw = field(segment, 5, 1, encoding);
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) {
    issues.add('OBX-2 declares NM but OBX-5 is not a number', 'validation', { ...at, field: 'OBX-5' });
    observation.dataAbsentReason = dataAbsentReason('error');
    return;
  }

  const unit = resolveUnit(segment, context);
  const result = toQuantity({
    value,
    unitCode: unit?.code,
    unitDisplay: unit?.display,
    loincCode
  });

  switch (result.kind) {
    case 'ok':
      observation.valueQuantity = result.quantity;
      return;
    case 'no-unit':
      // A count legitimately has no unit, so this is not a failure — but a number
      // whose unit nobody stated is not comparable with anything, and saying so is
      // cheaper than discovering it downstream.
      issues.add('OBX-6 is absent, so the numeric value carries no unit', 'validation', { ...at, field: 'OBX-6' });
      observation.valueQuantity = result.quantity;
      return;
    case 'invalid-unit':
      issues.add('OBX-6 is not a valid UCUM expression; the value was not published', 'validation', {
        ...at,
        field: 'OBX-6'
      });
      observation.dataAbsentReason = dataAbsentReason('error');
      return;
    case 'incommensurable':
      issues.add(
        "OBX-6 is valid UCUM but not commensurable with the unit required for OBX-3's LOINC code",
        'validation',
        { ...at, field: 'OBX-6' }
      );
      observation.dataAbsentReason = dataAbsentReason('error');
      return;
  }
}

/**
 * OBX-6 is a CWE, so the UCUM code may be in the primary triplet or the alternate.
 * A sender that writes `mm[Hg]^millimetres of mercury^UCUM` has told us which one is
 * the machine-readable code; one that writes `cm^centimeter^UCUM` has too, and the
 * display `centimeter` is not a UCUM symbol even though it reads like one.
 */
function resolveUnit(segment: Segment, context: ObservationContext): { code: string; display?: string } | undefined {
  const encoding = context.datatypes.encoding;
  const rep = repetition(segment, 6);
  if (rep === undefined) return undefined;

  const primaryCode = component(rep, 1, encoding);
  const primarySystem = component(rep, 3, encoding);
  const alternateCode = component(rep, 4, encoding);
  const alternateSystem = component(rep, 6, encoding);

  if (primarySystem !== 'UCUM' && alternateSystem === 'UCUM' && alternateCode !== undefined) {
    return { code: alternateCode, display: component(rep, 5, encoding) };
  }
  if (primaryCode === undefined) return undefined;
  return { code: primaryCode, display: component(rep, 2, encoding) };
}

function interpretation(code: string | undefined, display: string | undefined): CodeableConcept | undefined {
  if (code === undefined) return undefined;
  // Bound to observation-interpretation. A code the IG does not map is dropped
  // rather than published under a system that does not define it.
  if (!INTERPRETATION_CODES.has(code)) return undefined;
  return codeableConcept({
    system: OBSERVATION_INTERPRETATION_SYSTEM,
    code,
    ...(display ? { display } : {})
  });
}

/** NTE to Annotation. Source: IG segment map NTE[Observation]. */
export function noteFrom(segment: Segment, context: DatatypeContext): Annotation | undefined {
  const text = repetitions(segment, 3)
    .map((rep) => component(rep, 1, context.encoding))
    .filter((value): value is string => value !== undefined)
    .join('\n');
  if (text.length === 0) return undefined;

  const time = parseV2DateTime(field(segment, 6, 1, context.encoding));
  return { text, ...(time.ok && time.parsed.precision === 'second' ? { time: time.parsed.value } : {}) };
}
