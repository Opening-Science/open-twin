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
];

export type SupportedScope = (typeof SUPPORTED_SCOPES)[number];

export { SUPPORTED_SCOPES };
