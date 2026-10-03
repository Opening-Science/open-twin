/**
 * WHAT: Connector configuration constants and construction helpers.
 * NOT:  Must not hard-code clinical codes for Observations; mappers + allowlists own codes.
 * GOVERNED BY: DECISIONS.md#d8
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import type { SystemScope } from './constants';

/**
 * Password grant (legacy BodyLoop contract) or a caller-supplied Bearer token.
 * The library does not persist either; D8 leaves durable secrets to the host.
 */
export type BodyLoopClientConfig = {
  baseUrl: string;
  scope: SystemScope;
} & (
  | {
      username: string;
      password: string;
      apiToken?: undefined;
    }
  | {
      apiToken: string;
      username?: undefined;
      password?: undefined;
    }
);
