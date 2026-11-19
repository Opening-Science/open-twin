/**
 * WHAT: Package public barrel: re-exports the supported API surface.
 * NOT:  Must not contain mapping or clinical logic; implementation lives in sibling modules.
GOVERNED BY: DECISIONS.md#d9
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
export type {
  AggregateOptions,
  AggregateResult,
  Reconciliation,
  ReconciliationIssue,
  ReconciliationOptions,
  SourceBundle
} from './aggregate';
export { aggregate } from './aggregate';
export {
  type CatalogueEntry,
  type CatalogueSource,
  catalogueEntry,
  createMeasurementCatalogue,
  type MeasurementCatalogue,
  type RegistrationProblem,
  registrationProblems,
  sharedCatalogueEntries
} from './catalogue';
export {
  type CatalogueChange,
  type ConfigurationProblem,
  type ConfigurationUpdateResult,
  type ConfigurationValidationResult,
  generateReconciliationConfiguration,
  type MeasurementPreference,
  type MissingDataMode,
  RECONCILIATION_CONFIGURATION_VERSION,
  type ReconciliationConfiguration,
  type ReconciliationConfigurationSaveOptions,
  type SavedReconciliationConfiguration,
  updateReconciliationConfiguration,
  validateReconciliationConfiguration
} from './configuration';
export { effectiveDay, type Measure, measureOf, occasionKey } from './measure';
export {
  type ReadingAssessment,
  type ReadingIneligibility,
  type ReadingRequest,
  type ReadingResolution,
  type ReadingResolutionIssue,
  type ReadingWindow,
  type ResolvedReading,
  resolveReadings
} from './readings';
export type { ReconciliationAttempt } from './reconciliation';
export { type Candidate, type Selection, selectSource } from './select';
export { AGGREGATOR } from './sources';
