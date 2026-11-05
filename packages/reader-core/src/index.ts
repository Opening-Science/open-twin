/**
 * WHAT: Package public barrel: the reader types, interface, base class, the expected-summary helper and the descriptor check.
 * NOT:  Does not export the vitest conformance suite; that is the `@open-twin/reader-core/testing` entry, so consumers need no test runner at runtime.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export * from './base';
export * from './reader';
export * from './testing/expected';
export { checkDescriptor } from './testing/rules';
export * from './types';
