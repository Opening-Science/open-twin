/**
 * WHAT: Package public barrel: the reader types, interface, base classes, the helpers adapters use, registry, the expected-summary helper and the descriptor check.
 * NOT:  Does not export the vitest conformance suite; that is the `@open-twin/reader-core/testing` entry, so consumers need no test runner at runtime.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export * from './base';
export * from './oauthReader';
export * from './reader';
export * from './registry';
export { type ExpectedSummary, summarise } from './testing/expected';
export * from './types';
export * from './utils/connectorTag';
export * from './utils/descriptor';
export * from './utils/fileInput';
export * from './utils/operationOutcome';
export * from './utils/parser';
export * from './utils/subject';
export * from './wrappers/reconciling';
