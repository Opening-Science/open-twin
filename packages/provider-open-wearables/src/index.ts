/**
 * `@open-twin/open-wearables` — Open Wearables unified data model to FHIR R4.
 *
 * Open Wearables (https://openwearables.io, https://github.com/the-momentum/open-wearables)
 * is a self-hosted MIT-licensed platform that already ingests Apple Health, Fitbit,
 * Garmin, Google Health Connect, Oura, Polar, Samsung Health, Sensorbio, Strava,
 * Suunto, Ultrahuman and Whoop, and normalises all of them onto one schema.
 *
 * This package maps that one schema. It is therefore not a vendor integration: it
 * is a single mapper that covers every provider the platform supports, including
 * Apple HealthKit and Google Health Connect, which are on-device sources a
 * server-side Node connector cannot reach on its own.
 *
 * This package is a mapper. It has no HTTP client — see README for why.
 */
export { parseOrThrow } from './api/parse';
export {
  type SleepSession,
  SleepSessionPageSchema,
  SleepSessionSchema,
  type Workout,
  WorkoutPageSchema,
  WorkoutSchema
} from './api/schemas/events';
export { TimeSeriesPageSchema, type TimeSeriesSample, TimeSeriesSampleSchema } from './api/schemas/timeseries';
export { API_KEY_HEADER, CONNECTOR, ENDPOINTS, OPEN_WEARABLES_SYSTEM } from './config/constants';
export {
  type BuildBundleOptions,
  type BundleResult,
  buildOpenWearablesBundle,
  type OpenWearablesSync
} from './fhir/bundleBuilder';
export { type Refusal, SERIES_MAP, type SeriesMapping, UNRESOLVED_SERIES } from './fhir/seriesMap';
export { fhirDateTime } from './fhir/time';
