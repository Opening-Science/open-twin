# @open-twin/provider-oura

## 0.2.0

### Minor Changes

- Update compatibility for a breaking shared dependency release.

### Patch Changes

- db83d28: Prepare independently installable npm packages with compatible shared core
  dependencies, complete publication metadata, and verified runtime and TypeScript
  exports. Packages retain their existing APIs and mapping behavior.
  
  Use Node ESM-compatible FHIR type specifiers and include exposed Node type
  dependencies so strict TypeScript consumers work outside the workspace.
  
  Support manual package selection in GitHub Actions, with approved automated
  signed tags and publication of only the verified selected artifact.
- 1e599d3: Export `buildOuraBundle` from the package entry, so hosts that fetch Oura data themselves can build a bundle without importing from `src`.
- Updated dependencies [db83d28]
- Updated dependencies [1742aae]
- Updated dependencies [b1301e8]
  - @open-twin/fhir-core@0.2.0
