/**
 * WHAT: Builds HL7-validator exemplar Bundles from marker-class fixtures (live mapper path).
 * NOT:  Does not hand-write Observation JSON; fixtures feed buildCollectionBundle.
 * GOVERNED BY: docs/contracts/health-bundle.md
 * CORRECTNESS: Round-trip / fixture tests for bundle shape; HL7 validator not yet run locally (no JRE) — external authority gap, not an oversight.
 */
import type { Bundle } from 'fhir/r4';
import { ALL_MARKER_CLASS_FIXTURES, type MarkerClassFixture } from '../fixtures/markerClasses.js';
import { buildCollectionBundle } from '../fhir/bundleBuilder.js';

export function bundleFromMarkerClassFixture(fixture: MarkerClassFixture): Bundle {
  return buildCollectionBundle({
    context: fixture.context,
    measurements: [fixture.measurement],
    bundleTimestamp: fixture.bundleTimestamp,
  });
}

/** All nine marker-class bundles for CI registration. */
export function allMarkerClassBundles(): { name: string; bundle: Bundle }[] {
  return ALL_MARKER_CLASS_FIXTURES.map((f) => ({
    name: `anchor-${f.classId}`,
    bundle: bundleFromMarkerClassFixture(f),
  }));
}

export function anchorFerritinBundle(): Bundle {
  return bundleFromMarkerClassFixture(
    ALL_MARKER_CLASS_FIXTURES.find((f) => f.classId === 'mass_concentration')!,
  );
}
