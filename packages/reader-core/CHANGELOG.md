# @open-twin/reader-core

## 0.2.0

### Minor Changes

- 1742aae: `buildBundle` now tags every entry with the connector, and reader-core adds
  `HealthDataReader`, the shared base class for connector readers.

### Patch Changes

- db83d28: Prepare independently installable npm packages with compatible shared core
  dependencies, complete publication metadata, and verified runtime and TypeScript
  exports. Packages retain their existing APIs and mapping behavior.
  
  Use Node ESM-compatible FHIR type specifiers and include exposed Node type
  dependencies so strict TypeScript consumers work outside the workspace.
  
  Support manual package selection in GitHub Actions, with approved automated
  signed tags and publication of only the verified selected artifact.
- 8d63371: `summarise` leaves an effective time that does not parse out of the recorded range.
- Updated dependencies [db83d28]
- Updated dependencies [1742aae]
- Updated dependencies [b1301e8]
  - @open-twin/fhir-core@0.2.0
