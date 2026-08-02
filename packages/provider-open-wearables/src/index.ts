/**
 * WHAT: Package public barrel: re-exports the supported API surface.
 * NOT:  Must not contain mapping or clinical logic; implementation lives in sibling modules.
GOVERNED BY: DECISIONS.md#d9
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
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
