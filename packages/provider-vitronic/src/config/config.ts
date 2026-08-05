/**
 * WHAT: Connector configuration constants and construction helpers.
 * NOT:  Must not hard-code clinical codes for Observations; mappers + allowlists own codes.
GOVERNED BY: DECISIONS.md#d9
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import type { SystemScope } from './constants';

export interface BodyLoopClientConfig {
  baseUrl: string;
  username: string;
  password: string;
  scope: SystemScope;
}
