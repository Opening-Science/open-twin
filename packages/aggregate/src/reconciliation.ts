/**
 * WHAT: Discovers exact measurement occasions and applies user-owned strict or fallback source preferences.
 * NOT:  Does not infer day boundaries, convert units, synthesize values or grade clinical reliability.
 * GOVERNED BY: DECISIONS.md#d18; DECISIONS.md#d19; DECISIONS.md#d20
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Ambiguity at an inspected source stops selection, including fallback.
 */
import { ConnectorError, type MeasurementContext, SYSTEMS, uuidv5 } from '@open-twin/fhir-core';
import type { Observation } from 'fhir/r4.js';
import { catalogueEntry, type MeasurementCatalogue } from './catalogue';
import type { ReconciliationConfiguration } from './configuration';
import {
  assessReading,
  observationWindow,
  type ReadingAssessment,
  type ReadingIneligibility,
  type ReadingRequest,
  type ReadingResolutionIssue,
  type ReadingWindow,
  type ResolvedReading,
  scanReadings
} from './readings';
import { referenceIdentity } from './references';
import { AGGREGATOR, connectorOf, type SourceBundle } from './sources';

export interface ReconciliationAttempt {
  connector: string;
  eligibleCount: number;
  ineligibleReasons: ReadingIneligibility[];
  reason: 'selected' | 'no-eligible-reading' | 'ambiguous-readings' | 'ambiguous-declaration';
}

export interface Reconciliation {
  key: string;
  window: ReadingWindow;
  sources: string[];
  selected?: string;
  outcome: 'selected' | 'fallback' | 'abstained';
  reason: ReconciliationAttempt['reason'];
  attempts: ReconciliationAttempt[];
  policy: string;
}

export interface ReconciliationIssue extends Omit<ReadingResolutionIssue, 'code'> {
  code: ReadingResolutionIssue['code'] | 'missing-subject' | 'missing-time' | 'invalid-time';
}

interface Occasion {
  request: ReadingRequest;
  readings: ResolvedReading[];
  ambiguous: { connector: string; observation: Observation }[];
}

function occasionKey(key: string, subject: string, context: MeasurementContext, window: ReadingWindow): string {
  return JSON.stringify([key, subject, context.scope, context.statistic ?? null, window]);
}

function selectedValue(reading: ResolvedReading): Partial<Observation> {
  const element = reading.component ?? reading.observation;
  switch (reading.declaration.valueType) {
    case 'quantity':
      return { valueQuantity: element.valueQuantity };
    case 'codeable-concept':
      return { valueCodeableConcept: element.valueCodeableConcept };
    case 'string':
      return { valueString: element.valueString };
    case 'boolean':
      return { valueBoolean: element.valueBoolean };
    case 'integer':
      return { valueInteger: element.valueInteger };
    case 'range':
      return { valueRange: element.valueRange };
    case 'ratio':
      return { valueRatio: element.valueRatio };
    case 'sampled-data':
      return { valueSampledData: element.valueSampledData };
    case 'time':
      return { valueTime: element.valueTime };
    case 'date-time':
      return { valueDateTime: element.valueDateTime };
    case 'period':
      return { valuePeriod: element.valuePeriod };
    case 'none':
      throw new ConnectorError('Cannot derive a measurement without a value', {
        code: 'validation',
        connector: AGGREGATOR.connector,
        operation: 'aggregate'
      });
  }
}

function preserveReferences(derived: Observation, source: Observation, sourceReference: string): void {
  const required = new Set<string>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return;
    if ('reference' in value && typeof value.reference === 'string') {
      if (value.reference === '#') value.reference = sourceReference;
      else if (value.reference.startsWith('#')) required.add(value.reference.slice(1));
      else {
        const resolved = referenceIdentity(value.reference, sourceReference);
        if (!resolved) {
          throw new ConnectorError('Cannot preserve a relative reference without a RESTful source fullUrl', {
            code: 'validation',
            connector: AGGREGATOR.connector,
            operation: 'aggregate'
          });
        }
        value.reference = resolved;
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(derived);
  const contained: NonNullable<Observation['contained']> = [];
  // Visiting each copied target adds transitive references; the set terminates cycles.
  for (const id of required) {
    const targets = source.contained?.filter((resource) => resource.id === id) ?? [];
    const target = targets[0];
    if (!target || targets.length !== 1) {
      throw new ConnectorError('Every retained contained reference requires exactly one source target', {
        code: 'validation',
        connector: AGGREGATOR.connector,
        operation: 'aggregate'
      });
    }
    const copy = structuredClone(target);
    contained.push(copy);
    visit(copy);
  }
  if (contained.length) derived.contained = contained;
}

function derive(
  occasion: Occasion,
  winner: ResolvedReading,
  policy: string,
  subjectKey: string,
  references: ReadonlyMap<Observation, string>
): Observation {
  const referenceOf = (observation: Observation) => {
    const reference = references.get(observation);
    if (!reference) {
      throw new ConnectorError('Every considered observation requires a resolvable bundle address', {
        code: 'validation',
        connector: AGGREGATOR.connector,
        operation: 'aggregate'
      });
    }
    return reference;
  };
  const sourceReferences = [
    ...new Set([
      ...occasion.readings.map((reading) => referenceOf(reading.observation)),
      ...occasion.ambiguous.map(({ observation }) => referenceOf(observation))
    ])
  ].sort();
  const { observation } = winner;
  const element = winner.component ?? observation;
  const { key, window } = occasion.request;
  const derived: Observation = structuredClone({
    resourceType: 'Observation',
    id: uuidv5(
      JSON.stringify([
        'reconciled',
        subjectKey,
        occasionKey(key, occasion.request.subject, occasion.request.context, window),
        sourceReferences,
        winner.connector,
        referenceOf(observation)
      ])
    ),
    status: observation.status,
    code: element.code,
    subject: observation.subject,
    effectivePeriod: observation.effectivePeriod,
    effectiveDateTime: observation.effectiveDateTime,
    effectiveInstant: observation.effectiveInstant,
    category: observation.category,
    device: observation.device,
    performer: observation.performer,
    specimen: observation.specimen,
    bodySite: observation.bodySite,
    interpretation: element.interpretation,
    referenceRange: element.referenceRange,
    ...selectedValue(winner),
    method: { coding: [{ system: SYSTEMS.METHOD, code: 'source-selected' }], text: policy },
    derivedFrom: sourceReferences.map((reference) => ({ reference }))
  });
  preserveReferences(derived, observation, referenceOf(observation));
  return derived;
}

export function reconcile(options: {
  sources: readonly SourceBundle[];
  catalogue: MeasurementCatalogue;
  configuration: ReconciliationConfiguration;
  subjectKey: string;
  references: ReadonlyMap<Observation, string>;
  entryIndices: readonly (readonly number[])[];
}): { derived: Observation[]; reconciliations: Reconciliation[]; issues: ReconciliationIssue[] } {
  const scanned = scanReadings(options.catalogue, options.sources);
  const issues: ReconciliationIssue[] = [...scanned.issues];
  const occasions = new Map<string, Occasion>();
  const discover = (
    key: string,
    observation: Observation,
    position: { sourceIndex: number; observationIndex: number; location?: 'observation' | 'component' }
  ): Occasion | undefined => {
    const entry = catalogueEntry(options.catalogue, key);
    if (!entry?.shared) return undefined;
    const rawSubject = observation.subject?.reference;
    const subject = rawSubject ? referenceIdentity(rawSubject, options.references.get(observation)) : undefined;
    const window = observationWindow(observation);
    const scope = entry.definition.context.scope;
    const requiresPeriod = scope !== 'reading' && scope !== 'record';
    const validWindow = window !== undefined && (!requiresPeriod || window.kind === 'period');
    const addIssue = (code: ReconciliationIssue['code']) => issues.push({ code, matchedKeys: [key], ...position });
    if (!rawSubject?.trim()) addIssue('missing-subject');
    if (!validWindow) {
      addIssue(
        [
          observation.effectiveDateTime,
          observation.effectivePeriod,
          observation.effectiveInstant,
          observation.effectiveTiming
        ].some((value) => value !== undefined)
          ? 'invalid-time'
          : 'missing-time'
      );
    }
    if (!subject?.trim() || !window || !validWindow) return undefined;
    const id = occasionKey(key, subject, entry.definition.context, window);
    let occasion = occasions.get(id);
    if (!occasion) {
      occasion = {
        request: { key, subject, context: entry.definition.context, window },
        readings: [],
        ambiguous: []
      };
      occasions.set(id, occasion);
    }
    return occasion;
  };
  for (const { reading, sourceIndex, observationIndex } of scanned.readings) {
    discover(reading.declaration.key, reading.observation, {
      sourceIndex,
      observationIndex,
      location: reading.component ? 'component' : 'observation'
    })?.readings.push(reading);
  }
  for (const issue of scanned.issues) {
    if (issue.code !== 'ambiguous-declaration' || issue.observationIndex === undefined) continue;
    const source = options.sources[issue.sourceIndex];
    const resource = source?.bundle.entry?.[issue.observationIndex]?.resource;
    if (!source || resource?.resourceType !== 'Observation') continue;
    for (const key of issue.matchedKeys) {
      discover(key, resource as Observation, {
        sourceIndex: issue.sourceIndex,
        observationIndex: issue.observationIndex,
        location: issue.location
      })?.ambiguous.push({
        connector: connectorOf(source),
        observation: resource as Observation
      });
    }
  }

  const derived: Observation[] = [];
  const reconciliations: Reconciliation[] = [];
  for (const [, occasion] of [...occasions].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const preference = options.configuration.measurements[occasion.request.key];
    if (!preference) {
      throw new ConnectorError('Every shared measurement requires a validated preference', {
        code: 'validation',
        connector: AGGREGATOR.connector,
        operation: 'aggregate'
      });
    }
    const assessments = occasion.readings.map((reading) => assessReading(reading, occasion.request));
    const attempts: ReconciliationAttempt[] = [];
    let winner: ResolvedReading | undefined;
    const priority =
      preference.missingData === 'strict' ? preference.sourcePriority.slice(0, 1) : preference.sourcePriority;
    for (const connector of priority) {
      const candidates = assessments.filter((item) => item.reading.connector === connector);
      const eligible = candidates.filter(
        (item): item is ReadingAssessment & { eligibility: { kind: 'eligible' } } =>
          item.eligibility.kind === 'eligible'
      );
      const ambiguous = occasion.ambiguous.some((item) => item.connector === connector);
      const reason = ambiguous
        ? 'ambiguous-declaration'
        : eligible.length > 1
          ? 'ambiguous-readings'
          : eligible.length === 1
            ? 'selected'
            : 'no-eligible-reading';
      attempts.push({
        connector,
        eligibleCount: eligible.length,
        ineligibleReasons: [
          ...new Set(
            candidates.flatMap((item) => (item.eligibility.kind === 'ineligible' ? item.eligibility.reasons : []))
          )
        ].sort(),
        reason
      });
      if (reason === 'selected') winner = eligible[0]?.reading;
      if (reason !== 'no-eligible-reading') break;
    }
    const outcome = winner ? (attempts.length > 1 ? 'fallback' : 'selected') : 'abstained';
    const reason = attempts.at(-1)?.reason ?? 'no-eligible-reading';
    const policy = winner
      ? `${winner.connector} selected by configured ${preference.missingData} preference for ${occasion.request.key}${outcome === 'fallback' ? ' after fallback' : ''}.`
      : `Configured ${preference.missingData} preference abstained for ${occasion.request.key}: ${reason}.`;
    reconciliations.push({
      key: occasion.request.key,
      window: occasion.request.window,
      sources: [
        ...new Set([
          ...occasion.readings.map((item) => item.connector),
          ...occasion.ambiguous.map((item) => item.connector)
        ])
      ].sort(),
      ...(winner ? { selected: winner.connector } : {}),
      outcome,
      reason,
      attempts,
      policy
    });
    if (winner) derived.push(derive(occasion, winner, policy, options.subjectKey, options.references));
  }
  return {
    derived,
    reconciliations,
    issues: issues.map((issue) => ({
      ...issue,
      ...(issue.observationIndex === undefined
        ? {}
        : { observationIndex: options.entryIndices[issue.sourceIndex]?.[issue.observationIndex] })
    }))
  };
}
