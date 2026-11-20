# @open-twin/aggregate

## 0.2.0

### Minor Changes

- f05fddb: Add declaration-driven runtime measurement resolution and explicit reading eligibility
  for a requested key, context, subject reference and exact time window. Support
  observation and coded component values without converting units or selecting sources.
  Reject withdrawn/cancelled or result-less observation statuses and malformed complex
  values, including reversed ranges, invalid temporal values and unusable sampled data.
  Require corresponding detection limits for sampled-data `L` and `U` tokens.
  Reject unit-bearing ranges, ratios and sampled-data origins until declarations can
  express their units; unitless complex values remain supported.
  Keep the legacy aggregate API unchanged while configured reconciliation is migrated.
  Include sorted, unique matched declaration keys in resolution issues so callers can
  identify measurements affected by ambiguous declarations without exposing health payloads.
- 778bf95: Add explicit baseline-aware reconciliation configuration update proposals and
  catalogue change/conflict reporting. Preserve user priorities, exclusions and
  missing-data modes; append newly available sources and initialize newly shared
  keys. Unsafe removals and changed definitions/declarations require caller
  resolution without silently pruning preferences or promoting sources.
  Applications retain the previous catalogue snapshot and own review and persistence.
  Runtime aggregation and source selection remain unchanged.
- 1e72cab: BREAKING: aggregate now performs basic bundling by default. Enable reconciliation
  with reconciliation: { enabled: true, catalogue, configuration } to apply saved
  strict or fallback source preferences. Configuration is required and validated;
  reliability grades and legacy measurement/day mappings are never implicit fallbacks.
  
  Automatically discover declared shared measurements at exact matching instants or
  complete period boundaries. Return structured selections, fallbacks, abstentions,
  and discovery diagnostics. Missing or partial times cannot establish an occasion.
  Instant-only summaries produce invalid-time diagnostics without creating occasions;
  reading and record scopes still accept complete instants.
  Reconciliation results now identify a key and window instead of a measure and day.
  
  Retain source resource ids and fullUrls, coalesce identical resources at an address,
  and reject conflicting content at the same address and meta.versionId. Distinct
  resource versions retain their original fullUrls; derived lineage uses RESTful
  version-specific references. Basic bundling carries versions at opaque addresses,
  but ambiguous considered provenance fails explicitly instead of minting broken links.
  Derived measurements support observation and component values and reference
  original source identities. Focused observations and root or selected-component
  modifier extensions are explicitly ineligible until their semantics can be compared;
  strict abstains, fallback may select an eligible unqualified reading, and originals
  are preserved. These eligibility guards also apply to explicit reading resolution.
  Every source entry
  needs a nonempty fullUrl, including for basic bundling. Missing addresses
  fail validation before transaction entries can become invalid collection entries;
  addressed id-less resources retain their missing ids.
  The existing one-subject and connector-attribution requirements remain.
  
  Preserve the contained targets required by derived metadata, including transitive
  references, without copying unrelated panel-only resources. Keep back-references
  pointing at the original container and reject missing or ambiguous targets.
  Identical fragment subject labels in separate resources do not imply patient identity.
  
  Resolve relative subject identities using their containing entry's RESTful base.
  Equal patient ids from different servers or service roots are not the same subject.
  Unbased relative subjects now fail validation on both bundling and reconciliation;
  supply a common absolute or URN subject identity. Explicit reading requests compare
  against resolved subject identities as well.
  
  Rebase copied relative metadata references to their original absolute targets,
  including inside retained contained resources. Preserve the selected source's
  original effective[x], local UTC offset and precision; normalized windows are
  used only for comparison, reporting and stable identity.
  
  Add an explicit save option to configuration generation. Save-enabled calls return
  the configuration and absolute path of a timestamped, uniquely named JSON snapshot.
  Directories are created as needed and existing files are never overwritten.
  One-argument generation remains storage-free with its existing return shape;
  validation, updates and aggregation still perform no persistence.
- d6b05fe: Add a versioned, JSON-serializable source preference configuration with offline
  generation from the measurement catalogue and runtime validation of saved input.
  Defaults follow connector registration order and use strict missing-data handling.
  Users can reorder or exclude sources and enable fallback per shared measurement.
  Existing aggregation and selection behavior is unchanged.
  Non-enumerable measurement keys do not satisfy required shared-key coverage.

### Patch Changes

- db83d28: Prepare independently installable npm packages with compatible shared core
  dependencies, complete publication metadata, and verified runtime and TypeScript
  exports. Packages retain their existing APIs and mapping behavior.
  
  Use Node ESM-compatible FHIR type specifiers and include exposed Node type
  dependencies so strict TypeScript consumers work outside the workspace.
  
  Support manual package selection in GitHub Actions, with approved automated
  signed tags and publication of only the verified selected artifact.
- Updated dependencies [db83d28]
- Updated dependencies [1742aae]
  - @open-twin/fhir-core@0.2.0
