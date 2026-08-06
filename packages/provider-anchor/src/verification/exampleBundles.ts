/**
 * WHAT: Builds HL7-validator exemplar Bundles from marker-class fixtures (live mapper path).
 * NOT:  Does not hand-write Observation JSON; fixtures feed buildCollectionBundle.
 * GOVERNED BY: docs/contracts/health-bundle.md
 * CORRECTNESS: Round-trip / fixture tests for bundle shape; HL7 validator not yet run locally (no JRE) — external authority gap, not an oversight.
 */
import type { Bundle } from 'fhir/r4';
import { buildCollectionBundle } from '../fhir/bundleBuilder.js';
import { ALL_MARKER_CLASS_FIXTURES, type MarkerClassFixture } from '../fixtures/markerClasses.js';

export function bundleFromMarkerClassFixture(fixture: MarkerClassFixture): Bundle {
  return buildCollectionBundle({
    context: fixture.context,
    measurements: [fixture.measurement],
    bundleTimestamp: fixture.bundleTimestamp
  });
}

/** All nine marker-class bundles for CI registration. */
export function allMarkerClassBundles(): { name: string; bundle: Bundle }[] {
  return ALL_MARKER_CLASS_FIXTURES.map((f) => ({
    name: `anchor-${f.classId}`,
    bundle: bundleFromMarkerClassFixture(f)
  }));
}

function requireFixture(classId: MarkerClassFixture['classId']): MarkerClassFixture {
  const fixture = ALL_MARKER_CLASS_FIXTURES.find((f) => f.classId === classId);
  if (!fixture) throw new Error(`missing marker-class fixture: ${classId}`);
  return fixture;
}

export function anchorFerritinBundle(): Bundle {
  return bundleFromMarkerClassFixture(requireFixture('mass_concentration'));
}
