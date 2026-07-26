/**
 * `as const` is load-bearing. Without it `SupportedScope` widens to `string`, so
 * `scopes: ['nonsense_scope']` compiled cleanly, `z.enum(SUPPORTED_SCOPES)` inferred
 * `string[]`, and the switch over request types had no exhaustiveness checking —
 * a missing case was a runtime throw rather than a compile error.
 */
const SUPPORTED_SCOPES = [
  'daily_activity',
  'heartrate',
  'sleep',
  'daily_spo2',
  'personal_info',
  'workout',
  'daily_cardiovascular_age',
  'vO2_max',
  'daily_readiness',
  'daily_resilience',
  'daily_stress',
  'rest_mode_period',
  'ring_configuration',
  'session'
] as const;

export type SupportedScope = (typeof SUPPORTED_SCOPES)[number];

export { SUPPORTED_SCOPES };
