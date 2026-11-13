/**
 * WHAT: The measurement-definition and connector-declaration schema, its validation, and the audit that checks declarations against emitted FHIR.
 * NOT:  Holds no source preferences, reliability grades or selection policy; the shared definitions live in measurementDefinitions.ts and the combined catalogue in @open-twin/aggregate.
 * GOVERNED BY: DECISIONS.md#d18; DECISIONS.md#d4
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: A declaration identifies a value by coding and location, never by array position. Two declarations that could match the same emitted value are ambiguous and fail the audit — add a vendor-local coding to tell them apart rather than reordering anything.
 */
import type { Bundle, FhirResource, Observation, Quantity } from 'fhir/r4';
import { MEASUREMENT_DEFINITIONS, type SharedMeasurementKey } from './measurementDefinitions';
import { SYSTEMS } from './systems';

/** Version of the shape below. Bumped only when a field changes meaning or is removed. */
export const MEASUREMENT_SCHEMA_VERSION = 1 as const;

/** The FHIR R4 `value[x]` choices an Observation or component can carry, plus `none` for a value-less panel. */
export const MEASUREMENT_VALUE_TYPES = [
  'quantity',
  'codeable-concept',
  'string',
  'boolean',
  'integer',
  'range',
  'ratio',
  'sampled-data',
  'time',
  'date-time',
  'period',
  'none'
] as const;

export type MeasurementValueType = (typeof MEASUREMENT_VALUE_TYPES)[number];

/**
 * What one value describes. The same LOINC code means different things as an
 * individual reading and as a daily summary, so the scope is part of a measurement's
 * identity rather than a property of a particular reading.
 */
export const MEASUREMENT_SCOPES = [
  /** One measurement at an instant or over a short sampling window. */
  'reading',
  /** Accumulated or summarised over an arbitrary interval that none of the more specific scopes below describes. */
  'interval',
  /** One workout, exercise or activity session. */
  'session',
  /** One sleep period: a night's sleep or a nap. */
  'sleep-period',
  /** One calendar day. */
  'daily',
  /** A vendor-defined physiological day that does not align with calendar days. */
  'physiological-cycle',
  /** A fact about the person or device that is not tied to an occasion. */
  'record'
] as const;

export type MeasurementScope = (typeof MEASUREMENT_SCOPES)[number];

/** The statistic a summary value reports. Absent for a value that is not a statistic over its scope. */
export const MEASUREMENT_STATISTICS = ['total', 'mean', 'minimum', 'maximum'] as const;

export type MeasurementStatistic = (typeof MEASUREMENT_STATISTICS)[number];

export interface MeasurementContext {
  scope: MeasurementScope;
  statistic?: MeasurementStatistic;
}

/**
 * The identity of a measured concept, independent of who measures it.
 *
 * Carries no source preference and no reliability grade: a definition says what a
 * value means, never whose value is better.
 */
export interface MeasurementDefinition {
  /**
   * Stable key. Shared keys are lower kebab-case (`total-sleep-time`). A key owned by
   * one connector is prefixed with its connector id and a colon (`oura:sleep-score`).
   */
  key: string;
  /** What the value means, in enough detail to tell it from its neighbours. */
  description: string;
  valueType: MeasurementValueType;
  /** UCUM code every declaration of a quantity must emit. Absent where no unit applies. */
  canonicalUnit?: string;
  context: MeasurementContext;
}

export interface MeasurementCoding {
  system: string;
  code: string;
}

/** Where the value sits: the Observation's own `value[x]`, or the component carrying `coding` under a parent Observation. */
export type MeasurementValueLocation = { kind: 'observation' } | { kind: 'component'; parent: MeasurementCoding };

/** How one connector emits one measurement. */
export interface MeasurementDeclaration {
  /** A shared key from `MEASUREMENT_DEFINITIONS`, or one of this connector's own keys. */
  key: string;
  /** A coding the Observation (or component) carries that identifies this measurement. */
  coding: MeasurementCoding;
  location: MeasurementValueLocation;
  valueType: MeasurementValueType;
  /** UCUM code of the emitted Quantity. Declaring a unit converts nothing. */
  unit?: string;
  context: MeasurementContext;
}

/**
 * - `complete`: every Observation and component the connector emits is declared.
 * - `open`: the connector forwards codes it does not choose (a foreign FHIR bundle,
 *   an HL7 v2 message), so only the measurements it mints itself can be declared.
 */
export type DeclarationCoverage = 'complete' | 'open';

/** Everything a connector says about what it emits. Exported by each connector package. */
export interface MeasurementDeclarationSet {
  schemaVersion: typeof MEASUREMENT_SCHEMA_VERSION;
  /** The connector id, matching the `meta.tag` connector code on its bundles. */
  connector: string;
  /** Bumped whenever a declaration or connector-owned definition changes. */
  version: number;
  coverage: DeclarationCoverage;
  /** Definitions for measurements only this connector emits. Keys carry the `<connector>:` prefix. */
  definitions: MeasurementDefinition[];
  declarations: MeasurementDeclaration[];
}

export interface MeasurementProblem {
  code:
    | 'schema-version'
    | 'invalid-connector'
    | 'invalid-version'
    | 'invalid-key'
    | 'foreign-key'
    | 'duplicate-definition'
    | 'shadows-shared-definition'
    | 'unused-definition'
    | 'unknown-key'
    | 'duplicate-declaration'
    | 'value-type-mismatch'
    | 'unit-mismatch'
    | 'unit-not-applicable'
    | 'context-mismatch'
    | 'invalid-definition';
  /** Explains the problem. Names keys and codings only, never a value. */
  message: string;
  key?: string;
}

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const SHARED_KEY = new RegExp(`^${SEGMENT}$`);
const SCOPED_KEY = new RegExp(`^(${SEGMENT}):(${SEGMENT}(?:\\.${SEGMENT})*)$`);
const CONNECTOR_ID = SHARED_KEY;

export function isSharedMeasurementKey(key: string): boolean {
  return SHARED_KEY.test(key);
}

/** The connector that owns a scoped key, or undefined for a shared key or a malformed one. */
export function measurementKeyOwner(key: string): string | undefined {
  return SCOPED_KEY.exec(key)?.[1];
}

export function codingKey(coding: MeasurementCoding): string {
  return `${coding.system}|${coding.code}`;
}

function locationKey(location: MeasurementValueLocation): string {
  return location.kind === 'observation' ? 'observation' : `component<${codingKey(location.parent)}`;
}

/** Identifies the emitted value a declaration addresses. Two declarations with the same address are ambiguous. */
export function declarationAddress(declaration: Pick<MeasurementDeclaration, 'coding' | 'location'>): string {
  return `${locationKey(declaration.location)}>${codingKey(declaration.coding)}`;
}

function sameContext(a: MeasurementContext, b: MeasurementContext): boolean {
  return a.scope === b.scope && a.statistic === b.statistic;
}

function describeContext(context: MeasurementContext): string {
  return context.statistic ? `${context.scope}/${context.statistic}` : context.scope;
}

/** The shared definition for a key, or undefined when no shared definition has it. */
export function sharedMeasurementDefinition(key: string): MeasurementDefinition | undefined {
  return MEASUREMENT_DEFINITIONS.find((definition) => definition.key === key);
}

/**
 * A declaration whose value type, unit and context are those of its definition.
 *
 * Copying them is a convenience, not a guarantee: whether the connector really emits
 * that type and unit is established only by `auditMeasurementDeclarations` against
 * what its mappers produce.
 */
export function declareMeasurement(
  definitionOrKey: MeasurementDefinition | SharedMeasurementKey,
  coding: MeasurementCoding,
  parent?: MeasurementCoding
): MeasurementDeclaration {
  const definition =
    typeof definitionOrKey === 'string' ? sharedMeasurementDefinition(definitionOrKey) : definitionOrKey;
  if (!definition) throw new TypeError(`No shared measurement definition for ${String(definitionOrKey)}`);
  return {
    key: definition.key,
    coding: { system: coding.system, code: coding.code },
    location: parent
      ? { kind: 'component', parent: { system: parent.system, code: parent.code } }
      : { kind: 'observation' },
    valueType: definition.valueType,
    ...(definition.canonicalUnit !== undefined ? { unit: definition.canonicalUnit } : {}),
    context: { ...definition.context }
  };
}

/** Problems with a definition taken on its own, whoever owns it. */
export function definitionProblems(definition: MeasurementDefinition): MeasurementProblem[] {
  const problems: MeasurementProblem[] = [];
  const key = definition.key;
  if (!definition.description?.trim()) {
    problems.push({ code: 'invalid-definition', key, message: `${key} has no description` });
  }
  if (!MEASUREMENT_VALUE_TYPES.includes(definition.valueType)) {
    problems.push({ code: 'invalid-definition', key, message: `${key} has an unknown value type` });
  }
  if (!MEASUREMENT_SCOPES.includes(definition.context?.scope)) {
    problems.push({ code: 'invalid-definition', key, message: `${key} has an unknown scope` });
  }
  if (definition.context?.statistic !== undefined && !MEASUREMENT_STATISTICS.includes(definition.context.statistic)) {
    problems.push({ code: 'invalid-definition', key, message: `${key} has an unknown statistic` });
  }
  if (definition.canonicalUnit !== undefined && definition.valueType !== 'quantity') {
    problems.push({
      code: 'unit-not-applicable',
      key,
      message: `${key} declares a canonical unit on a ${definition.valueType} value`
    });
  }
  return problems;
}

/**
 * Checks a connector's declaration set against the shared definitions.
 *
 * Returns every problem rather than the first, so a connector author sees the whole
 * list at once. An empty array means the set is internally consistent; it says
 * nothing about whether the connector actually emits what it declares — that is
 * `auditMeasurementDeclarations`.
 */
export function validateMeasurementDeclarations(
  set: MeasurementDeclarationSet,
  sharedDefinitions: readonly MeasurementDefinition[] = MEASUREMENT_DEFINITIONS
): MeasurementProblem[] {
  const problems: MeasurementProblem[] = [];

  if (set.schemaVersion !== MEASUREMENT_SCHEMA_VERSION) {
    problems.push({
      code: 'schema-version',
      message: `schema version ${String(set.schemaVersion)} is not ${MEASUREMENT_SCHEMA_VERSION}`
    });
  }
  if (typeof set.connector !== 'string' || !CONNECTOR_ID.test(set.connector)) {
    problems.push({ code: 'invalid-connector', message: 'connector id must be lower kebab-case' });
  }
  if (!Number.isInteger(set.version) || set.version < 1) {
    problems.push({ code: 'invalid-version', message: 'declaration set version must be a positive integer' });
  }

  const shared = new Map(sharedDefinitions.map((definition) => [definition.key, definition]));
  const own = new Map<string, MeasurementDefinition>();

  for (const definition of set.definitions) {
    const key = definition.key;
    const owner = measurementKeyOwner(key);
    if (owner === undefined) {
      problems.push({
        code: shared.has(key) ? 'shadows-shared-definition' : 'invalid-key',
        key,
        message: shared.has(key)
          ? `${key} is a shared key and cannot be redefined by ${set.connector}`
          : `${key} must be prefixed with "${set.connector}:"`
      });
      continue;
    }
    if (owner !== set.connector) {
      problems.push({ code: 'foreign-key', key, message: `${key} belongs to ${owner}, not ${set.connector}` });
      continue;
    }
    if (own.has(key)) {
      problems.push({ code: 'duplicate-definition', key, message: `${key} is defined more than once` });
      continue;
    }
    problems.push(...definitionProblems(definition));
    own.set(key, definition);
  }

  const used = new Set<string>();
  const addresses = new Set<string>();

  for (const declaration of set.declarations) {
    const key = declaration.key;
    const owner = measurementKeyOwner(key);
    if (owner !== undefined && owner !== set.connector) {
      problems.push({
        code: 'foreign-key',
        key,
        message: `${set.connector} declares ${key}, which belongs to ${owner}`
      });
      continue;
    }
    const definition = own.get(key) ?? shared.get(key);
    if (!definition) {
      problems.push({ code: 'unknown-key', key, message: `${key} has no shared or ${set.connector} definition` });
      continue;
    }
    used.add(key);

    const address = declarationAddress(declaration);
    if (addresses.has(address)) {
      problems.push({
        code: 'duplicate-declaration',
        key,
        message: `${codingKey(declaration.coding)} at ${locationKey(declaration.location)} is declared more than once`
      });
    }
    addresses.add(address);

    if (declaration.valueType !== definition.valueType) {
      problems.push({
        code: 'value-type-mismatch',
        key,
        message: `${key} is declared as ${declaration.valueType} but defined as ${definition.valueType}`
      });
    }
    if (declaration.unit !== undefined && declaration.valueType !== 'quantity') {
      problems.push({
        code: 'unit-not-applicable',
        key,
        message: `${key} declares a unit on a ${declaration.valueType} value`
      });
    } else if (declaration.unit !== definition.canonicalUnit) {
      // Commensurable is not equivalent: a `cm` declaration under a `m` definition is
      // a factor of 100 that nothing downstream would apply.
      problems.push({
        code: 'unit-mismatch',
        key,
        message: `${key} is declared in ${declaration.unit ?? 'no unit'} but its canonical unit is ${definition.canonicalUnit ?? 'none'}`
      });
    }
    if (!sameContext(declaration.context, definition.context)) {
      problems.push({
        code: 'context-mismatch',
        key,
        message: `${key} is declared as ${describeContext(declaration.context)} but defined as ${describeContext(definition.context)}`
      });
    }
  }

  for (const key of own.keys()) {
    if (!used.has(key)) {
      problems.push({ code: 'unused-definition', key, message: `${key} is defined but never declared` });
    }
  }

  return problems;
}

/** The `value[x]` an Observation or component actually carries, or undefined when it carries none. */
export function emittedValueType(element: Partial<Observation>): Exclude<MeasurementValueType, 'none'> | undefined {
  if (element.valueQuantity !== undefined) return 'quantity';
  if (element.valueCodeableConcept !== undefined) return 'codeable-concept';
  if (element.valueString !== undefined) return 'string';
  if (element.valueBoolean !== undefined) return 'boolean';
  if (element.valueInteger !== undefined) return 'integer';
  if (element.valueRange !== undefined) return 'range';
  if (element.valueRatio !== undefined) return 'ratio';
  if (element.valueSampledData !== undefined) return 'sampled-data';
  if (element.valueTime !== undefined) return 'time';
  if (element.valueDateTime !== undefined) return 'date-time';
  if (element.valuePeriod !== undefined) return 'period';
  return undefined;
}

function carries(codings: { system?: string; code?: string }[] | undefined, coding: MeasurementCoding): boolean {
  return (codings ?? []).some((candidate) => candidate.system === coding.system && candidate.code === coding.code);
}

type Component = NonNullable<Observation['component']>[number];

/** A declared measurement found in one Observation. */
export interface LocatedMeasurement {
  declaration: MeasurementDeclaration;
  observation: Observation;
  /** The component holding the value, when the declaration is component-level. */
  component?: Component;
}

/**
 * The declarations an Observation's own value matches, and those each component
 * matches. A component is matched by its coding and its parent's coding — never by
 * where it sits in the array.
 */
export function matchDeclarations(
  observation: Observation,
  declarations: readonly MeasurementDeclaration[]
): {
  observation: MeasurementDeclaration[];
  components: { component: Component; declarations: MeasurementDeclaration[] }[];
} {
  const parentCodings = observation.code?.coding;
  return {
    observation: declarations.filter(
      (declaration) => declaration.location.kind === 'observation' && carries(parentCodings, declaration.coding)
    ),
    components: (observation.component ?? []).map((component) => ({
      component,
      declarations: declarations.filter(
        (declaration) =>
          declaration.location.kind === 'component' &&
          carries(parentCodings, declaration.location.parent) &&
          carries(component.code?.coding, declaration.coding)
      )
    }))
  };
}

/** Every declared measurement in an Observation, skipping anything unmatched or ambiguous. */
export function locateMeasurements(
  observation: Observation,
  declarations: readonly MeasurementDeclaration[]
): LocatedMeasurement[] {
  const matched = matchDeclarations(observation, declarations);
  const located: LocatedMeasurement[] = [];
  const [own] = matched.observation;
  if (own && matched.observation.length === 1) located.push({ declaration: own, observation });
  for (const { component, declarations: found } of matched.components) {
    const [declaration] = found;
    if (declaration && found.length === 1) located.push({ declaration, observation, component });
  }
  return located;
}

export interface DeclarationAuditIssue {
  code: 'undeclared' | 'ambiguous' | 'value-type-mismatch' | 'unit-mismatch';
  /** The Observation's id, or its position in the input when it has none. */
  observation: string;
  location: 'observation' | 'component';
  /** The codings of the element at fault. Codings only, never a value. */
  codings: string[];
  message: string;
}

export interface DeclarationAudit {
  issues: DeclarationAuditIssue[];
  /** How many emitted elements each declaration matched, keyed by `declarationAddress`, including value-less ones. */
  matches: Map<string, number>;
  /**
   * Declarations no emitted element exercised. A typed declaration is exercised only by a
   * matching element that carries a value: one carrying only `dataAbsentReason` proves
   * neither its type nor its unit. A `none` declaration is exercised by any match.
   * A fixture that exercises the mappers should leave none.
   */
  unexercised: MeasurementDeclaration[];
}

function codingsOf(codings: { system?: string; code?: string }[] | undefined): string[] {
  return (codings ?? []).map((coding) => `${coding.system ?? ''}|${coding.code ?? ''}`);
}

function quantityUnitProblem(quantity: Quantity, declared: string | undefined): string | undefined {
  if (declared === undefined) {
    return quantity.code === undefined ? undefined : `carries ${quantity.code} but no unit is declared`;
  }
  if (quantity.system !== SYSTEMS.UCUM) return `declares ${declared} but the quantity is not UCUM-coded`;
  return quantity.code === declared ? undefined : `declares ${declared} but emits ${quantity.code ?? 'no unit'}`;
}

/**
 * Checks what a connector emitted against what it declares.
 *
 * Each Observation and each component must match exactly one declaration, carry the
 * declared value type (or no value, which is absence and never zero), and carry the
 * declared UCUM unit. For an `open` set, values with no declaration are expected —
 * they are forwarded foreign codes — and are not reported.
 */
export function auditMeasurementDeclarations(
  set: Pick<MeasurementDeclarationSet, 'declarations' | 'coverage'>,
  input: Bundle | readonly FhirResource[]
): DeclarationAudit {
  const resources: FhirResource[] = Array.isArray(input)
    ? [...input]
    : ((input as Bundle).entry ?? []).flatMap((entry) => (entry.resource ? [entry.resource as FhirResource] : []));
  const issues: DeclarationAuditIssue[] = [];
  const matches = new Map<string, number>();
  const exercised = new Set<string>();

  const check = (
    found: MeasurementDeclaration[],
    element: Partial<Observation>,
    codings: { system?: string; code?: string }[] | undefined,
    observation: string,
    location: 'observation' | 'component'
  ): void => {
    const shown = codingsOf(codings);
    if (found.length === 0) {
      if (set.coverage === 'complete') {
        issues.push({ code: 'undeclared', observation, location, codings: shown, message: 'no declaration matches' });
      }
      return;
    }
    if (found.length > 1) {
      issues.push({
        code: 'ambiguous',
        observation,
        location,
        codings: shown,
        message: `matches ${found.map((declaration) => declaration.key).join(', ')}`
      });
      return;
    }
    const [declaration] = found as [MeasurementDeclaration];
    const address = declarationAddress(declaration);
    matches.set(address, (matches.get(address) ?? 0) + 1);

    const emitted = emittedValueType(element);
    if (declaration.valueType === 'none' || emitted !== undefined) exercised.add(address);
    if (
      declaration.valueType === 'none'
        ? emitted !== undefined
        : emitted !== undefined && emitted !== declaration.valueType
    ) {
      issues.push({
        code: 'value-type-mismatch',
        observation,
        location,
        codings: shown,
        message: `${declaration.key} declares ${declaration.valueType} but emits ${emitted ?? 'no value'}`
      });
      return;
    }
    if (element.valueQuantity) {
      const problem = quantityUnitProblem(element.valueQuantity, declaration.unit);
      if (problem) {
        issues.push({
          code: 'unit-mismatch',
          observation,
          location,
          codings: shown,
          message: `${declaration.key} ${problem}`
        });
      }
    }
  };

  resources.forEach((resource, index) => {
    if (resource.resourceType !== 'Observation') return;
    const name = resource.id ?? `#${index}`;
    const matched = matchDeclarations(resource, set.declarations);
    check(matched.observation, resource, resource.code?.coding, name, 'observation');
    for (const { component, declarations } of matched.components) {
      check(declarations, component, component.code?.coding, name, 'component');
    }
  });

  return {
    issues,
    matches,
    unexercised: set.declarations.filter((declaration) => !exercised.has(declarationAddress(declaration)))
  };
}
