/**
 * WHAT: HTTP path constants for the vendor API.
 * NOT:  Must not embed secrets or response parsing.
GOVERNED BY: DECISIONS.md#d9
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { WHOOP_API_BASE, WHOOP_AUTH_URL, WHOOP_TOKEN_URL } from '../config/constants';

export { WHOOP_API_BASE, WHOOP_AUTH_URL, WHOOP_TOKEN_URL };

export const WHOOP_PATHS = {
  recovery: '/recovery',
  cycle: '/cycle',
  sleep: '/activity/sleep'
} as const;
