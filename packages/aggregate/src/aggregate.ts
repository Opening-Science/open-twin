/**
 * WHAT: Combines source bundles without changing resource identity, optionally reconciling declared measurements.
 * NOT:  Does not fetch, infer patient identity, rank reliability or persist preferences.
 * GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d19; DECISIONS.md#d20
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Source fullUrls and ids are retained; conflicting addresses are errors, never silently rewritten.
 */
import { isDeepStrictEqual } from 'node:util';
import { ConnectorError, connectorMeta, uuidv5 } from '@open-twin/fhir-core';
import type { Bundle, BundleEntry, Observation } from 'fhir/r4.js';
import type { MeasurementCatalogue } from './catalogue';
import { type ReconciliationConfiguration, validateReconciliationConfiguration } from './configuration';
import { type Reconciliation, type ReconciliationIssue, reconcile } from './reconciliation';
import { referenceIdentity, versionedReference } from './references';
import { AGGREGATOR, connectorOf, type SourceBundle } from './sources';

export type { Reconciliation, ReconciliationIssue } from './reconciliation';
export type { SourceBundle } from './sources';

export type ReconciliationOptions =
  | { enabled: false }
  | {
      enabled: true;
      catalogue: MeasurementCatalogue;
      configuration: ReconciliationConfiguration;
    };

export interface AggregateOptions {
  sources: SourceBundle[];
  /** The subject every source describes; this key never establishes patient identity. */
  subjectKey: string;
  timestamp: string;
  /** Omitted means basic bundling, with no source-selection decisions. */
  reconciliation?: ReconciliationOptions;
}

export interface AggregateResult {
  bundle: Bundle;
  reconciliations: Reconciliation[];
  /** Diagnostics contain codes and input positions, never resource payloads. */
  issues: ReconciliationIssue[];
  reconciliationStatus: 'disabled' | 'no-occasions' | 'completed';
}

function reject(message: string): never {
  throw new ConnectorError(message, {
    code: 'validation',
    connector: AGGREGATOR.connector,
    operation: 'aggregate'
  });
}

export function aggregate(options: AggregateOptions): AggregateResult {
  if (options.sources.length === 0) reject('Cannot aggregate nothing: supply at least one source bundle');
  const settings = options.reconciliation;
  if (settings !== undefined && typeof settings?.enabled !== 'boolean') {
    reject('Reconciliation requires an explicit boolean enabled flag');
  }
  let configuration: ReconciliationConfiguration | undefined;
  if (settings?.enabled) {
    if (!settings.catalogue || !settings.configuration) {
      reject('Enabled reconciliation requires a catalogue and configuration');
    }
    const validation = validateReconciliationConfiguration(settings.configuration, settings.catalogue);
    if (!validation.ok) {
      reject(`Invalid reconciliation configuration: ${validation.problems.map((problem) => problem.code).join(', ')}`);
    }
    configuration = validation.configuration;
  }

  const entries: BundleEntry[] = [];
  const addresses = new Map<string, Map<string | undefined, BundleEntry>>();
  const references = new Map<Observation, string>();
  const subjects = new Set<string>();
  const sources: SourceBundle[] = [];
  const entryIndices: number[][] = [];
  const seenByConnector = new Map<string, Set<BundleEntry>>();

  for (const source of options.sources) {
    const connector = connectorOf(source);
    const sourceEntries: BundleEntry[] = [];
    const indices: number[] = [];
    const seen = seenByConnector.get(connector) ?? new Set<BundleEntry>();
    seenByConnector.set(connector, seen);
    for (const [index, entry] of (source.bundle.entry ?? []).entries()) {
      const resource = entry.resource;
      if (!resource) reject('Source bundle entries must contain resources');
      const address = entry.fullUrl;
      if (!address?.trim()) reject('Source bundle entries must contain a nonempty fullUrl for the output collection');
      const versions = addresses.get(address) ?? new Map<string | undefined, BundleEntry>();
      const version = resource.meta?.versionId;
      let carried = versions.get(version);
      if (carried && !isDeepStrictEqual(carried.resource, resource)) {
        reject('Conflicting source resources share a bundle address');
      }
      if (!carried) {
        carried = { fullUrl: address, resource: structuredClone(resource) };
        entries.push(carried);
        versions.set(version, carried);
        addresses.set(address, versions);
      }
      if (!seen.has(carried)) {
        sourceEntries.push(carried);
        indices.push(index);
        seen.add(carried);
      }
      if (resource.resourceType === 'Observation') {
        const observation = resource as Observation;
        const subject = observation.subject?.reference;
        if (subject?.trim()) {
          const identity = subject.startsWith('#')
            ? JSON.stringify([subject, address])
            : referenceIdentity(subject, address);
          if (!identity) {
            reject('Cannot establish subject identity: relative references require a RESTful entry fullUrl');
          }
          subjects.add(identity);
        }
      }
    }
    sources.push({ connector, bundle: { ...source.bundle, entry: sourceEntries } });
    entryIndices.push(indices);
  }
  if (subjects.size > 1) {
    reject('Cannot aggregate different subjects: supply the same subject reference to every connector');
  }
  for (const [address, versions] of addresses) {
    for (const [version, entry] of versions) {
      if (entry.resource?.resourceType !== 'Observation') continue;
      const reference = versionedReference(address, version);
      // Unversioned or opaque references cannot distinguish multiple resource versions.
      if (versions.size > 1 && (version === undefined || reference === undefined)) continue;
      references.set(entry.resource as Observation, reference ?? address);
    }
  }

  const result =
    settings?.enabled && configuration
      ? reconcile({
          sources,
          catalogue: settings.catalogue,
          configuration,
          subjectKey: options.subjectKey,
          references,
          entryIndices
        })
      : { derived: [], reconciliations: [], issues: [] };
  for (const resource of result.derived) {
    const fullUrl = `urn:uuid:${resource.id}`;
    if (addresses.has(fullUrl)) reject('A derived observation conflicts with a source bundle address');
    entries.push({ fullUrl, resource });
  }
  return {
    bundle: {
      resourceType: 'Bundle',
      id: uuidv5(
        JSON.stringify([AGGREGATOR.connector, options.subjectKey, [...new Set(sources.map(connectorOf))].sort()])
      ),
      meta: connectorMeta(AGGREGATOR),
      type: 'collection',
      timestamp: options.timestamp,
      entry: entries
    },
    reconciliations: result.reconciliations,
    issues: result.issues,
    reconciliationStatus: !settings?.enabled ? 'disabled' : result.reconciliations.length ? 'completed' : 'no-occasions'
  };
}
