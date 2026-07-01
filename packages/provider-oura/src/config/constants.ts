const CLIENT_ID = process.env.OURA_CLIENT_ID;
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET;
const REDIRECT_URI = process.env.OURA_REDIRECT_URI;
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

export { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SUPPORTED_SCOPES };
