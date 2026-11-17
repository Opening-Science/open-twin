# Changelog

Notable changes to open-twin. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). How releases are made is described
under [Releases](Contributing.md#releases).

## [Unreleased]

### Fixed

- `@open-twin/provider-oura` re-exports the `OuraRingAppConfig` interface as a
  type, so the package loads from source under Bun and `isolatedModules` (#271).

### Added

- `@open-twin/reader-core`: the reader types and `IHealthDataReader`, with the
  host `TokenStore` and `CursorStore` interfaces from D8 (#232, decision D16).
- `@open-twin/reader-core`: the `HealthDataReader` base class adapters extend
  (#251).
- `@open-twin/reader-core`: the eight conformance rules as vitest assertions,
  `checkDescriptor` for the registry gate, and `summarise`, which an adapter's
  `expected.json` records (#252).
- `@open-twin/fhir-core`: shared measurement definitions (`MEASUREMENT_DEFINITIONS`),
  the connector declaration schema, `validateMeasurementDeclarations` and
  `auditMeasurementDeclarations` (#267, decision D18).
- Every public connector package exports a versioned `MeasurementDeclarationSet`
  describing each Observation and component it emits, tested against its mappers'
  output (#267).
- `@open-twin/aggregate`: `createMeasurementCatalogue` builds a catalogue grouped by
  measurement key from registered connectors' declarations, without fetching data
  (#267).

### Changed

- Public packages can be released and versioned independently with Changesets.
  Shared core remains a regular compatible dependency; packed artifacts are
  checked in clean external npm consumers (#265).
- Public FHIR declaration imports use Node ESM-compatible `fhir/r4.js`
  specifiers. Google Health and VITRONIC declare the Node types exposed by their
  public declarations. These packaging fixes do not alter mapping behavior.

- `@open-twin/provider-whoop`: recovery resting heart rate and cycle average heart
  rate now each carry a WHOOP-local coding beside LOINC 8867-4. Both were emitted
  under the bare code at the same location and could not be told apart (#267, D18).
- `@open-twin/open-wearables`: `heart_rate` samples, `exercise_time` samples and
  workouts gain a vendor-local coding after their LOINC coding, for the same reason.
  LOINC codings, values and units are unchanged (#267, D18).
- The Synthea recipe and Cohort Studio moved, with their history, to
  [opentwin-synthea](https://github.com/Opening-Science/opentwin-synthea)
  (#228). The recipe there includes the reproducibility fix from #218.

[Unreleased]: https://github.com/Opening-Science/open-twin/commits/main
