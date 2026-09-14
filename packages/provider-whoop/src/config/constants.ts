/**
 * WHAT: Connector configuration constants and construction helpers.
 * NOT:  Must not hard-code clinical codes for Observations; mappers + allowlists own codes.
GOVERNED BY: DECISIONS.md#d9
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export const WHOOP_SCOPES = [
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:profile',
  'offline'
] as const;

export type WhoopScope = (typeof WHOOP_SCOPES)[number];

export const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
export const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
export const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';
