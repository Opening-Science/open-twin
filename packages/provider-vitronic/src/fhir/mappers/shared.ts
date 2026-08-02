/**
 * WHAT: Maps one vendor record type into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: signed review record (verify/terminology-allowlist.json) for LOINC/SNOMED emitted here; UCUM gate for quantities.
 */
import {
  CATEGORY,
  createObservation,
  dataAbsentReason,
  deterministicId,
  numericComponent,
  optionalNumericComponent,
  quantity,
  SYSTEMS,
  subjectReference,
  UCUM
} from '@open-twin/fhir-core';
import type {
  CodeableConcept,
  Extension,
  Identifier,
  Observation,
  ObservationComponent,
  Quantity,
  Reference
} from 'fhir/r4';
import type { CommonType } from '../../api/schemas/common';
import type { Scope } from '../../config/constants';

export { dataAbsentReason, numericComponent, optionalNumericComponent, SYSTEMS, UCUM };

/** Tagged onto every bundle so output is traceable to a connector release. */
export const CONNECTOR = { connector: 'vitronic', version: '0.1.0' } as const;

/**
 * Foundation-controlled base for the BodyLoop concepts FHIR has no element for.
 * `hidden` and `style` are operator presentation flags; dropping them silently
 * published measurements the operator had suppressed as ordinary results.
 */
export const EXTENSION_BASE = 'http://opentwin.ch/fhir/StructureDefinition/vitronic';

/**
 * The subject, scan and time every Observation of one scan shares.
 *
 * Built once per bundle rather than derived per mapper, because a bundle whose
 * Observations disagree about who they are about is worse than one with no
 * subject at all.
 */
export interface MeasurementContext {
  /** BodyLoop viatar id. Identifies the scan, never the person. */
  scanId: string;
  /** D1. Either caller-supplied or a deterministic `urn:uuid:`. */
  subject: Reference;
  /** The vendor key `subject` was derived from; also seeds resource ids (D2). */
  subjectKey: string;
  /** D7. `Viatar.meta.crtime`, normalised by `toFhirDateTime`. */
  effectiveDateTime?: string;
}

export interface MeasurementContextOptions {
  scanId: string;
  /** Used verbatim when supplied — the integrator knows who the patient is. */
  subject?: Reference;
  /**
   * Vendor key for the person, e.g. `proband/42`. Falls back to the scan, which
   * keeps one bundle internally consistent but cannot link two scans of the same
   * person: only `Viatar.proband_id` can do that.
   */
  subjectKey?: string;
  effectiveDateTime?: string;
}

export function measurementContext(options: MeasurementContextOptions): MeasurementContext {
  const subjectKey = options.subjectKey ?? `viatar/${options.scanId}`;
  return {
    scanId: options.scanId,
    subjectKey,
    subject: subjectReference({
      ...(options.subject ? { reference: options.subject } : {}),
      connector: CONNECTOR.connector,
      subjectKey
    }),
    ...(options.effectiveDateTime ? { effectiveDateTime: options.effectiveDateTime } : {})
  };
}

/* -------------------------------------------------------------------------- */
/* Units                                                                      */
/* -------------------------------------------------------------------------- */

/** Rounds away the float noise a unit conversion introduces. */
function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * D10. The BodyLoop angle and axis payloads are radians, proven arithmetically
 * rather than assumed: `primary + supplementary` is exactly π to the last bit of
 * float64 and `conjugate` is exactly `2π − primary`, and the axis rotation
 * triple reproduces `atan2` of the axis direction components. Publishing those
 * numbers under UCUM `deg` understated every angle by 57.3×, so an 84.9° joint
 * angle shipped as 1.48.
 */
export function radiansToDegrees(radians: number): number {
  return roundTo((radians * 180) / Math.PI, 4);
}

/** A plane angle in degrees, from a BodyLoop value in radians. */
export function degrees(radians: number | null | undefined): Quantity | undefined {
  return radians === null || radians === undefined ? undefined : quantity(radiansToDegrees(radians), UCUM.DEGREE);
}

export function metres(value: number | null | undefined): Quantity | undefined {
  return quantity(value, UCUM.METRE);
}

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

const OFFSET_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalises a BodyLoop timestamp into a FHIR `dateTime`.
 *
 * FHIR requires a UTC offset once a time of day is present, and D7 forbids
 * inventing one. BodyLoop may report `crtime` without an offset, so such a value
 * is narrowed to the civil date it states — less precise, but true. Returning
 * the raw string instead would produce a resource the validator rejects.
 */
export function toFhirDateTime(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }
  if (OFFSET_DATE_TIME.test(text) || DATE_ONLY.test(text)) {
    return text;
  }
  return LOCAL_DATE_TIME.exec(text)?.[1];
}

/**
 * As `toFhirDateTime`, but for `Bundle.timestamp`, which is an `instant` and
 * therefore admits no lower precision at all.
 */
export function toFhirInstant(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text && OFFSET_DATE_TIME.test(text) ? text : undefined;
}

/* -------------------------------------------------------------------------- */
/* Paths, ids and references                                                  */
/* -------------------------------------------------------------------------- */

const LATERALITY: Record<string, string> = { L: 'left', R: 'right', M: 'midline' };

/**
 * Namespaces BodyLoop prefixes some paths with. They name the geometric model a
 * landmark belongs to, not an anatomical location, so they are dropped from body
 * site wording — never from codes, which must stay exactly as the API spells them.
 */
const MODEL_NAMESPACES = new Set(['stick_model']);

function pathSegments(path: string): string[] {
  return path.split('.').filter((segment) => segment.length > 0);
}

/** `arm.shoulder.R` -> `Arm shoulder (right)`. */
export function humanizePath(path: string): string {
  const segments = pathSegments(path);
  if (segments.length > 1 && MODEL_NAMESPACES.has(segments[0] as string)) {
    segments.shift();
  }
  const last = segments[segments.length - 1];
  const laterality = last === undefined ? undefined : LATERALITY[last];
  const words = (laterality === undefined ? segments : segments.slice(0, -1)).join(' ').replace(/_/g, ' ').trim();
  const capitalised = words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : '';
  if (laterality === undefined || capitalised.length === 0) {
    return capitalised;
  }
  return `${capitalised} (${laterality})`;
}

/**
 * `bodySite` as text only. BodyLoop paths are a proprietary skeleton taxonomy;
 * guessing at SNOMED CT body structure codes would assert anatomy nobody signed
 * off on, and a wrong standard code is unrecoverable where free text is not.
 */
export function bodySiteFromPath(path: string): CodeableConcept | undefined {
  const text = humanizePath(path);
  return text.length > 0 ? { text } : undefined;
}

/** D2. Stable business identifier for one measurement of one scan. */
export function measurementIdentifier(scanId: string, scope: Scope, path: string): Identifier {
  return { system: SYSTEMS.VITRONIC_IDENTIFIER, value: `scan/${scanId}/${scope}/${path}` };
}

/**
 * The scan is provenance, not the subject: `Scan/${id}` was previously emitted
 * as `Observation.subject`, and `Scan` is not a FHIR resource type, so the
 * reference could never resolve. It belongs in `derivedFrom`, as an
 * identifier-only logical reference — the mapping layer cannot know the
 * server-assigned id of the study resource.
 */
export function scanReference(scanId: string): Reference {
  return {
    type: 'ImagingStudy',
    identifier: { system: SYSTEMS.VITRONIC_IDENTIFIER, value: `scan/${scanId}` },
    display: `BodyLoop scan ${scanId}`
  };
}

/**
 * Logical reference to the Observation carrying an anatomical landmark. It
 * resolves only if the marker path is spelled exactly as in `marker_path`;
 * paths are deliberately not normalised.
 */
export function markerReference(scanId: string, markerPath: string, role?: string): Reference {
  return {
    type: 'Observation',
    identifier: measurementIdentifier(scanId, 'marker', markerPath),
    display: role ? `${role}: ${markerPath}` : markerPath
  };
}

/* -------------------------------------------------------------------------- */
/* Common fields                                                              */
/* -------------------------------------------------------------------------- */

/**
 * BodyLoop presentation flags FHIR has no element for. `hidden: true` is the
 * operator's signal that a measurement should not be shown; it was previously
 * dropped and the measurement published as `status: 'final'` regardless.
 *
 * TODO(clinical-review): decide whether `hidden: true` should suppress the
 * Observation or downgrade `status`. Preserving the flag is the safe interim.
 */
export function commonExtensions(common: CommonType): Extension[] {
  const extensions: Extension[] = [];
  if (typeof common.hidden === 'boolean') {
    extensions.push({ url: `${EXTENSION_BASE}-hidden`, valueBoolean: common.hidden });
  }
  const style = common.style?.trim();
  if (style) {
    extensions.push({ url: `${EXTENSION_BASE}-style`, valueString: style });
  }
  return extensions;
}

export interface MeasurementObservationInput {
  context: MeasurementContext;
  scope: Scope;
  /** BodyLoop measurement path; doubles as the code in the VITRONIC CodeSystem. */
  path: string;
  common: CommonType;
  /**
   * Display for the coding. Derived from the code, never from the operator's
   * label — a `Coding.display` describes the code, and the operator's own
   * wording belongs in `code.text` where a consumer can tell the two apart.
   */
  display: string;
  /** Path the body site is derived from. `null` for measures with no anatomy. */
  bodySitePath?: string | null;
  derivedFromMarkers?: ReadonlyArray<{ path: string; role?: string }>;
  valueQuantity?: Quantity;
  valueString?: string;
  valueBoolean?: boolean;
  /** Set when no value resolved. Mutually exclusive with value[x] per obs-6. */
  dataAbsentReason?: CodeableConcept;
  components?: Array<ObservationComponent | undefined>;
  extensions?: Extension[];
}

/** Builds the Observation shape every BodyLoop measurement type shares. */
export function createMeasurementObservation(input: MeasurementObservationInput): Observation {
  const { common, context, path, scope } = input;

  const identifier: Identifier[] = [measurementIdentifier(context.scanId, scope, path)];
  const externalKey = common.key_external?.trim();
  if (externalKey) {
    // Same namespace, disjoint prefix, so an operator-chosen key can never
    // collide with a mapper-minted measurement identifier.
    identifier.push({ system: SYSTEMS.VITRONIC_IDENTIFIER, value: `external-key/${externalKey}` });
  }

  const label = common.label?.trim();
  const note = common.note?.trim();
  const observation = createObservation({
    // D2: a pure function of scan, scope and path, so re-syncing one scan
    // updates its Observations instead of duplicating them.
    id: deterministicId({
      connector: CONNECTOR.connector,
      subjectKey: context.subjectKey,
      recordId: context.scanId,
      measure: `${scope}/${path}`
    }),
    identifier,
    code: { system: SYSTEMS.VITRONIC, code: path, display: input.display },
    ...(label ? { codeText: label } : {}),
    category: CATEGORY.EXAM,
    subject: context.subject,
    ...(context.effectiveDateTime ? { effectiveDateTime: context.effectiveDateTime } : {}),
    ...(input.valueQuantity ? { valueQuantity: input.valueQuantity } : {}),
    ...(input.valueString !== undefined ? { valueString: input.valueString } : {}),
    ...(input.valueBoolean !== undefined ? { valueBoolean: input.valueBoolean } : {}),
    ...(input.dataAbsentReason ? { dataAbsentReason: input.dataAbsentReason } : {}),
    ...(input.components ? { components: input.components } : {}),
    ...(note ? { note } : {})
  });

  const derivedFrom: Reference[] = [scanReference(context.scanId)];
  for (const marker of input.derivedFromMarkers ?? []) {
    const markerPath = marker.path?.trim();
    if (markerPath) {
      derivedFrom.push(markerReference(context.scanId, markerPath, marker.role));
    }
  }
  observation.derivedFrom = derivedFrom;

  if (input.bodySitePath !== null) {
    const bodySite = bodySiteFromPath(input.bodySitePath ?? path);
    if (bodySite) {
      observation.bodySite = bodySite;
    }
  }

  const extensions = [...commonExtensions(common), ...(input.extensions ?? [])];
  if (extensions.length > 0) {
    observation.extension = extensions;
  }

  return observation;
}
