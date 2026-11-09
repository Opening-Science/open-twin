/**
 * WHAT: Package public barrel: the reader types, interface, base class and the helpers adapters use.
 * NOT:  Maps no vendor format; each adapter lives in its own ingestion package.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export * from './base';
export * from './reader';
export * from './types';
export * from './utils/connectorTag';
export * from './utils/fileInput';
export * from './utils/operationOutcome';
export * from './utils/parser';
export * from './utils/subject';
