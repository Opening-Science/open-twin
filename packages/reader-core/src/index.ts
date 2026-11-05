/**
 * WHAT: Package public barrel: the reader types, interface, base class, the expected-summary helper and the descriptor check.
 * NOT:  Maps no vendor format; each adapter lives in its own ingestion package.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export * from './base';
export * from './reader';
export * from './testing/expected';
export { checkDescriptor } from './testing/rules';
export * from './types';
