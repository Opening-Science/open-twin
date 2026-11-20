/**
 * WHAT: The `@open-twin/reader-core/testing` entry: only what an adapter's tests import.
 * NOT:  Not part of the runtime entry; importing it outside a test pulls in vitest.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export { type ConformanceOptions, describeReaderConformance } from './conformance';
export { type ExpectedSummary, summarise } from './expected';
export { type ConformanceFixture, type FhirBundleValidator, withGlobalFetch } from './rules';
