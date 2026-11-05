/**
 * WHAT: Package public barrel: the reader types, interface and base class.
 * NOT:  Maps no vendor format; each adapter lives in its own ingestion package.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export * from './base';
export * from './reader';
export * from './types';
