/**
 * WHAT: ExpectedSummary and summarise(bundle): the fingerprint an adapter's expected.json records beside each fixture (conformance rule 8).
 * NOT:  Does not judge whether the values are right; it only pins what the fixture produces today so an unintended change to a mapper is a red run.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: a summary pins counts and the effective range, not values. `absentValues` catches 0-for-missing only when the fixture has a missing value, so every fixture should include one.
 */
import type { Bundle, Observation, Resource } from 'fhir/r4';

export const isObservation = (resource: Resource | undefined): resource is Observation =>
  resource?.resourceType === 'Observation';

export interface ExpectedSummary {
  resourceTypes: Record<string, number>;
  /** Keyed by `system|code` of the first coding. */
  observationCodes: Record<string, number>;
  /** As written by the source, offset kept (D7). */
  firstEffective?: string;
  lastEffective?: string;
  /** A mapper that writes 0 for missing data lowers this. */
  absentValues: number;
}

function sortedRecord(map: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of [...map.keys()].sort()) out[key] = map.get(key) as number;
  return out;
}

function codeKey(observation: Observation): string {
  const coding = observation.code?.coding?.[0];
  return `${coding?.system ?? ''}|${coding?.code ?? ''}`;
}

function effectiveOf(observation: Observation): string | undefined {
  return observation.effectiveDateTime ?? observation.effectivePeriod?.start ?? observation.effectiveInstant;
}

export function summarise(bundle: Bundle): ExpectedSummary {
  const resourceTypes = new Map<string, number>();
  const observationCodes = new Map<string, number>();
  let firstEffective: string | undefined;
  let lastEffective: string | undefined;
  let absentValues = 0;

  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource;

    if (!resource) continue;

    resourceTypes.set(resource.resourceType, (resourceTypes.get(resource.resourceType) ?? 0) + 1);

    if (!isObservation(resource)) continue;

    const key = codeKey(resource);
    observationCodes.set(key, (observationCodes.get(key) ?? 0) + 1);

    if (resource.dataAbsentReason) absentValues += 1;

    for (const component of resource.component ?? []) {
      if (component.dataAbsentReason) absentValues += 1;
    }

    const effective = effectiveOf(resource);

    if (effective === undefined) continue;

    if (firstEffective === undefined || effective < firstEffective) firstEffective = effective;

    if (lastEffective === undefined || effective > lastEffective) lastEffective = effective;
  }

  const summary: ExpectedSummary = {
    resourceTypes: sortedRecord(resourceTypes),
    observationCodes: sortedRecord(observationCodes),
    absentValues
  };

  if (firstEffective !== undefined) summary.firstEffective = firstEffective;

  if (lastEffective !== undefined) summary.lastEffective = lastEffective;

  return summary;
}
