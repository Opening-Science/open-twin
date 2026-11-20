/**
 * WHAT: Resolves registered measurements in source bundles and checks their eligibility for an explicit reconciliation request.
 * NOT:  Selects no source, converts no units, infers no patient identity and changes no input resource.
 * GOVERNED BY: DECISIONS.md#d18
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Equal keys or calendar dates are not enough: only exact instants or complete matching period boundaries are comparable.
 */
import {
  ConnectorError,
  emittedValueType,
  type LocatedMeasurement,
  locateMeasurements,
  type MeasurementContext,
  type MeasurementDefinition,
  matchDeclarations,
  SYSTEMS
} from '@open-twin/fhir-core';
import type { Observation, Period, Quantity, Range, SampledData } from 'fhir/r4.js';
import { catalogueEntry, type MeasurementCatalogue } from './catalogue';
import { referenceIdentity } from './references';
import { AGGREGATOR, connectorOf, type SourceBundle } from './sources';

export type ReadingWindow = { kind: 'instant'; at: string } | { kind: 'period'; start: string; end: string };

export interface ReadingRequest {
  key: string;
  /** Exact resolved subject identity, not a patient-matching hint. */
  subject: string;
  context: MeasurementContext;
  window: ReadingWindow;
}

export type ReadingIneligibility =
  | 'unusable-status'
  | 'unsupported-focus'
  | 'unsupported-modifier-extension'
  | 'data-absent'
  | 'missing-value'
  | 'invalid-value'
  | 'value-type-mismatch'
  | 'unit-mismatch'
  | 'context-mismatch'
  | 'missing-subject'
  | 'subject-mismatch'
  | 'missing-time'
  | 'invalid-time'
  | 'time-window-mismatch';

export interface ResolvedReading extends LocatedMeasurement {
  connector: string;
  definition: MeasurementDefinition;
  /** Original containing entry address, used to resolve relative and fragment subjects. */
  fullUrl?: string;
}

export interface ReadingAssessment {
  /** Data for selection/provenance, not intended for logging. */
  reading: ResolvedReading;
  eligibility: { kind: 'eligible' } | { kind: 'ineligible'; reasons: ReadingIneligibility[] };
}

export interface ReadingResolutionIssue {
  code: 'unregistered-connector' | 'undeclared-measurement' | 'ambiguous-declaration';
  /** Unique registered declaration keys in sorted order; empty when nothing matched. */
  matchedKeys: string[];
  /** Diagnostics contain only declaration keys and input positions, never payloads or subject references. */
  sourceIndex: number;
  observationIndex?: number;
  location?: 'observation' | 'component';
}

export interface ReadingResolution {
  /** All unambiguous matches for the requested key, including unusable ones. */
  readings: ReadingAssessment[];
  /** Unmatched elements and ambiguous declarations are explicit, not eligible readings. */
  issues: ReadingResolutionIssue[];
}

interface Instant {
  second: number;
  fraction: string;
}

interface Window {
  kind: ReadingWindow['kind'];
  start: Instant;
  end: Instant;
}

// Require seconds and an explicit zone. Date.parse alone accepts partial dates and
// normalizes impossible dates; its millisecond precision also loses sub-ms differences.
function instant(value: string): Instant | undefined {
  const match =
    /^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}:[0-9]{2}:[0-9]{2})(?:\.([0-9]+))?(Z|[+-][0-9]{2}:[0-9]{2})$/.exec(value);
  if (!match) return undefined;
  const [, date = '', time = '', fraction = '', zone = ''] = match;
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(midnight) || date.startsWith('0000') || new Date(midnight).toISOString().slice(0, 10) !== date) {
    return undefined;
  }
  const offsetHour = zone === 'Z' ? 0 : Number(zone.slice(1, 3));
  const offsetMinute = zone === 'Z' ? 0 : Number(zone.slice(4, 6));
  if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return undefined;
  if (Number(time.slice(0, 2)) > 23 || Number(time.slice(3, 5)) > 59 || Number(time.slice(6, 8)) > 59) {
    return undefined;
  }
  const second = Date.parse(`${date}T${time}${zone}`) / 1000;
  return Number.isFinite(second) ? { second, fraction: fraction.replace(/0+$/, '') } : undefined;
}

function compare(a: Instant, b: Instant): number {
  return a.second - b.second || (a.fraction < b.fraction ? -1 : a.fraction > b.fraction ? 1 : 0);
}

function windowOf(window: ReadingWindow): Window | undefined {
  const start = instant(window.kind === 'instant' ? window.at : window.start);
  const end = window.kind === 'instant' ? start : instant(window.end);
  if (!start || !end || (window.kind === 'period' && compare(start, end) >= 0)) return undefined;
  return { kind: window.kind, start, end };
}

/** Complete, timezone-normalized boundaries, retaining all fractional precision. */
export function observationWindow(observation: Observation): ReadingWindow | undefined {
  const effective = [
    observation.effectiveDateTime,
    observation.effectivePeriod,
    observation.effectiveInstant,
    observation.effectiveTiming
  ].filter((value) => value !== undefined);
  if (effective.length !== 1) return undefined;
  const parsed = observation.effectivePeriod
    ? windowOf({
        kind: 'period',
        start: observation.effectivePeriod.start ?? '',
        end: observation.effectivePeriod.end ?? ''
      })
    : windowOf({ kind: 'instant', at: observation.effectiveDateTime ?? observation.effectiveInstant ?? '' });
  if (!parsed) return undefined;
  const format = (value: Instant) =>
    new Date(value.second * 1000).toISOString().replace('.000Z', `${value.fraction ? `.${value.fraction}` : ''}Z`);
  const normalized: ReadingWindow =
    parsed.kind === 'instant'
      ? { kind: 'instant', at: format(parsed.start) }
      : { kind: 'period', start: format(parsed.start), end: format(parsed.end) };
  return windowOf(normalized) ? normalized : undefined;
}

function sameContext(a: MeasurementContext, b: MeasurementContext): boolean {
  return a.scope === b.scope && a.statistic === b.statistic;
}

function finite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasUnit(value: Quantity | undefined): boolean {
  return value !== undefined && (value.code !== undefined || value.system !== undefined || value.unit !== undefined);
}

function quantityProblem(value: Quantity): ReadingIneligibility | undefined {
  if (value.value === undefined) return 'missing-value';
  return finite(value.value) && value.comparator === undefined ? undefined : 'invalid-value';
}

function rangeProblem(value: Range): ReadingIneligibility | undefined {
  const { low, high } = value;
  if (!low && !high) return 'missing-value';
  for (const bound of [low, high]) {
    if (!bound) continue;
    const problem = quantityProblem(bound);
    if (problem) return problem;
  }
  if (low && high) {
    if (low.system !== high.system || low.code !== high.code || (low.code === undefined && low.unit !== high.unit)) {
      return 'unit-mismatch';
    }
    if (low.value !== undefined && high.value !== undefined && low.value > high.value) return 'invalid-value';
  }
  return undefined;
}

function dateTimeBounds(value: string): { lower: Instant; upper: Instant } | undefined {
  if (value.includes('T')) {
    const parsed = instant(value);
    return parsed ? { lower: parsed, upper: parsed } : undefined;
  }
  if (!/^[0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?$/.test(value)) return undefined;
  const date = value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
  const parsed = instant(`${date}T00:00:00Z`);
  if (!parsed) return undefined;
  const next = new Date(parsed.second * 1000);
  if (value.length === 4) next.setUTCFullYear(next.getUTCFullYear() + 1);
  else if (value.length === 7) next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCDate(next.getUTCDate() + 1);
  // Partial dates carry no zone. These outer bounds only detect definite reversal;
  // they never turn a partial value into a comparable effective measurement window.
  return {
    lower: { second: parsed.second - 14 * 3600, fraction: '' },
    upper: { second: next.getTime() / 1000 + 14 * 3600, fraction: '' }
  };
}

function periodProblem(value: Period): ReadingIneligibility | undefined {
  const { start, end } = value;
  if (start === undefined && end === undefined) return 'missing-value';
  const from = start === undefined ? undefined : dateTimeBounds(start);
  const to = end === undefined ? undefined : dateTimeBounds(end);
  if ((start !== undefined && !from) || (end !== undefined && !to)) return 'invalid-value';
  if (start !== undefined && end !== undefined && from && to) {
    if (!start.includes('T') && !end.includes('T')) {
      const precision = Math.min(start.length, end.length);
      if (start.slice(0, precision) > end.slice(0, precision)) return 'invalid-value';
    } else if (compare(from.lower, to.upper) > 0) return 'invalid-value';
  }
  return undefined;
}

function sampledDataProblem(value: SampledData): ReadingIneligibility | undefined {
  if (!value.data?.trim() || value.origin?.value === undefined) return 'missing-value';
  if (
    quantityProblem(value.origin) ||
    !finite(value.period) ||
    value.period <= 0 ||
    !Number.isInteger(value.dimensions) ||
    value.dimensions <= 0 ||
    value.dimensions > 2147483647 ||
    [value.factor, value.lowerLimit, value.upperLimit].some((number) => number !== undefined && !finite(number)) ||
    (value.lowerLimit !== undefined && value.upperLimit !== undefined && value.lowerLimit > value.upperLimit)
  ) {
    return 'invalid-value';
  }
  const samples = value.data.split(' ');
  const decimal = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
  if (
    samples.length % value.dimensions !== 0 ||
    (samples.includes('L') && value.lowerLimit === undefined) ||
    (samples.includes('U') && value.upperLimit === undefined) ||
    samples.some(
      (sample) => !['E', 'L', 'U'].includes(sample) && !(decimal.test(sample) && Number.isFinite(Number(sample)))
    )
  ) {
    return 'invalid-value';
  }
  return samples.some((sample) => decimal.test(sample)) ? undefined : 'missing-value';
}

function valueProblem(element: Partial<Observation>): ReadingIneligibility | undefined {
  switch (emittedValueType(element)) {
    case 'quantity':
      return element.valueQuantity ? quantityProblem(element.valueQuantity) : 'missing-value';
    case 'integer':
      return Number.isInteger(element.valueInteger) &&
        finite(element.valueInteger) &&
        element.valueInteger >= -2147483648 &&
        element.valueInteger <= 2147483647
        ? undefined
        : 'invalid-value';
    case 'boolean':
      return typeof element.valueBoolean === 'boolean' ? undefined : 'invalid-value';
    case 'string':
      return element.valueString?.length ? undefined : 'missing-value';
    case 'codeable-concept':
      return element.valueCodeableConcept?.text?.trim() ||
        element.valueCodeableConcept?.coding?.some((coding) => coding.code?.trim())
        ? undefined
        : 'missing-value';
    case 'range':
      return element.valueRange ? rangeProblem(element.valueRange) : 'missing-value';
    case 'ratio':
      return element.valueRatio?.numerator &&
        element.valueRatio.denominator &&
        !quantityProblem(element.valueRatio.numerator) &&
        !quantityProblem(element.valueRatio.denominator) &&
        element.valueRatio.denominator.value !== 0
        ? undefined
        : 'invalid-value';
    case 'sampled-data':
      return element.valueSampledData ? sampledDataProblem(element.valueSampledData) : 'missing-value';
    case 'time':
      if (!element.valueTime?.trim()) return 'missing-value';
      return /^(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]+)?$/.test(element.valueTime)
        ? undefined
        : 'invalid-value';
    case 'date-time':
      if (!element.valueDateTime?.trim()) return 'missing-value';
      return dateTimeBounds(element.valueDateTime) ? undefined : 'invalid-value';
    case 'period':
      return element.valuePeriod ? periodProblem(element.valuePeriod) : 'missing-value';
    default:
      return 'missing-value';
  }
}

function assess(reading: ResolvedReading, request: ReadingRequest, requestedWindow: Window): ReadingAssessment {
  const { observation, declaration, definition } = reading;
  const element = reading.component ?? observation;
  const reasons: ReadingIneligibility[] = [];
  if (observation.focus?.length) reasons.push('unsupported-focus');
  if (observation.modifierExtension?.length || reading.component?.modifierExtension?.length) {
    reasons.push('unsupported-modifier-extension');
  }
  if (!['preliminary', 'final', 'amended', 'corrected', 'unknown'].includes(observation.status)) {
    reasons.push('unusable-status');
  }
  const emitted = emittedValueType(element);
  if (element.dataAbsentReason !== undefined) reasons.push('data-absent');
  else if (emitted === undefined || declaration.valueType === 'none') reasons.push('missing-value');
  else if (
    emitted !== declaration.valueType ||
    emitted !== definition.valueType ||
    Object.entries(element).filter(([key, value]) => value !== undefined && /^value[A-Z]/.test(key)).length !== 1
  ) {
    reasons.push('value-type-mismatch');
  } else {
    const problem = valueProblem(element);
    if (problem) reasons.push(problem);
    if (element.valueQuantity) {
      const quantity = element.valueQuantity;
      const correctUnit =
        declaration.unit === definition.canonicalUnit &&
        (declaration.unit === undefined
          ? !hasUnit(quantity)
          : quantity.system === SYSTEMS.UCUM && quantity.code === declaration.unit);
      if (!correctUnit) reasons.push('unit-mismatch');
    } else if (
      [
        element.valueRange?.low,
        element.valueRange?.high,
        element.valueRatio?.numerator,
        element.valueRatio?.denominator,
        element.valueSampledData?.origin
      ].some(hasUnit) &&
      !reasons.includes('unit-mismatch')
    ) {
      // Declarations cannot describe units nested in complex value types.
      reasons.push('unit-mismatch');
    }
  }

  if (!sameContext(declaration.context, definition.context) || !sameContext(declaration.context, request.context)) {
    reasons.push('context-mismatch');
  }
  const scope = declaration.context.scope;
  if (scope !== 'reading' && scope !== 'record' && requestedWindow.kind !== 'period') {
    if (!reasons.includes('context-mismatch')) reasons.push('context-mismatch');
  }

  const subject = observation.subject?.reference;
  if (!subject?.trim()) reasons.push('missing-subject');
  else if (referenceIdentity(subject, reading.fullUrl) !== request.subject) reasons.push('subject-mismatch');

  const effectiveCount = [
    observation.effectiveDateTime,
    observation.effectivePeriod,
    observation.effectiveInstant,
    observation.effectiveTiming
  ].filter((value) => value !== undefined).length;
  if (effectiveCount === 0) reasons.push('missing-time');
  else {
    const normalized = observationWindow(observation);
    const actual = normalized ? windowOf(normalized) : undefined;
    if (!actual) reasons.push('invalid-time');
    else if (
      actual.kind !== requestedWindow.kind ||
      compare(actual.start, requestedWindow.start) !== 0 ||
      compare(actual.end, requestedWindow.end) !== 0
    ) {
      reasons.push('time-window-mismatch');
    }
  }
  return { reading, eligibility: reasons.length ? { kind: 'ineligible', reasons } : { kind: 'eligible' } };
}

export function assessReading(reading: ResolvedReading, request: ReadingRequest): ReadingAssessment {
  const window = windowOf(request.window);
  if (!window) {
    throw new ConnectorError('Reading request requires a complete time window', {
      code: 'validation',
      connector: AGGREGATOR.connector,
      operation: 'resolveReadings'
    });
  }
  return assess(reading, request, window);
}

/**
 * Resolves one requested key using only the catalogue's registered declarations.
 * Absence yields no reading; it does not remove a source's declared capability.
 * All same-source matches survive so a later selection policy can abstain on ambiguity.
 */
export function resolveReadings(options: {
  catalogue: MeasurementCatalogue;
  sources: readonly SourceBundle[];
  request: ReadingRequest;
}): ReadingResolution {
  const { catalogue, sources, request } = options;
  const entry = catalogueEntry(catalogue, request.key);
  const requestedWindow = windowOf(request.window);
  if (!entry || !request.subject.trim() || !requestedWindow) {
    throw new ConnectorError(
      'Reading request requires a registered key, a subject reference and a complete time window',
      {
        code: 'validation',
        connector: AGGREGATOR.connector,
        operation: 'resolveReadings'
      }
    );
  }

  const scanned = scanReadings(catalogue, sources);
  return {
    readings: scanned.readings
      .filter(({ reading }) => reading.declaration.key === request.key)
      .map(({ reading }) => assess(reading, request, requestedWindow)),
    issues: scanned.issues
  };
}

/** Shared inventory for explicit resolution and automatic occasion discovery. */
export function scanReadings(catalogue: MeasurementCatalogue, sources: readonly SourceBundle[]) {
  const readings: { reading: ResolvedReading; sourceIndex: number; observationIndex: number }[] = [];
  const issues: ReadingResolutionIssue[] = [];
  sources.forEach((source, sourceIndex) => {
    const connector = connectorOf(source);
    if (!catalogue.connectors.some((registered) => registered.connector === connector)) {
      issues.push({ code: 'unregistered-connector', matchedKeys: [], sourceIndex });
      return;
    }
    // Match all keys before filtering: otherwise a second declaration at the same
    // value location could disappear and make an ambiguous reading look usable.
    const declarations = catalogue.entries.flatMap((candidate) =>
      candidate.sources
        .filter((registered) => registered.connector === connector)
        .flatMap((registered) => registered.declarations)
    );
    (source.bundle.entry ?? []).forEach(({ resource, fullUrl }, observationIndex) => {
      if (resource?.resourceType !== 'Observation') return;
      const observation = resource as Observation;
      const matched = matchDeclarations(observation, declarations);
      for (const element of [
        { location: 'observation' as const, declarations: matched.observation },
        ...matched.components.map((component) => ({
          location: 'component' as const,
          declarations: component.declarations
        }))
      ]) {
        if (element.declarations.length !== 1) {
          issues.push({
            code: element.declarations.length === 0 ? 'undeclared-measurement' : 'ambiguous-declaration',
            matchedKeys: [...new Set(element.declarations.map((declaration) => declaration.key))].sort(),
            sourceIndex,
            observationIndex,
            location: element.location
          });
        }
      }
      for (const located of locateMeasurements(observation, declarations)) {
        const definition = catalogueEntry(catalogue, located.declaration.key)?.definition;
        if (!definition) {
          throw new ConnectorError('Registered measurement has no definition', {
            code: 'validation',
            connector: AGGREGATOR.connector,
            operation: 'resolveReadings'
          });
        }
        readings.push({ reading: { ...located, connector, definition, fullUrl }, sourceIndex, observationIndex });
      }
    });
  });
  return { readings, issues };
}
