# Changelog

Notable changes to open-twin. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). How releases are made is described
under [Releases](Contributing.md#releases).

## [Unreleased]

### Added

- `ReconcilingReader` in `@open-twin/reader-core`: reads one request from several
  readers and returns one bundle reconciled by `aggregate`, with every reconciliation
  and abstention recorded. This is the hand-off twin-llm consumes (#241).
- `OuraReader` in `@open-twin/provider-oura`: the first API reader, with the host
  `TokenStore` bridged to the token handler and a per-wearer token key (#239).
- `FhirR4Reader` in `@open-twin/fhir-r4`: the first reader adapter, run through the
  conformance suite over the Synthea fixtures (#236).
- `registry/connectors.json`, the single source of truth for the nine connectors,
  with its generated JSON Schema, `loadRegistry` in `@open-twin/reader-core`, the
  blocking `check-registry` gate and the generated tables in README and
  `docs/registry.md` (#234).
- `@open-twin/reader-core`: the reader types and `IHealthDataReader`, with the
  host `TokenStore` and `CursorStore` interfaces from D8 (#232, decision D16).
- `@open-twin/reader-core`: the `HealthDataReader` base class adapters extend
  (#251).
- `@open-twin/reader-core`: the eight conformance rules as vitest assertions,
  `checkDescriptor` for the registry gate, and `summarise`, which an adapter's
  `expected.json` records (#252).
- `@open-twin/reader-core/testing`: `describeReaderConformance`, the suite each
  adapter runs over its fixtures (#253).
- `@open-twin/reader-core`: `OAuthReader` with a required per-wearer token key,
  and the host test doubles on the testing entry (#254).

### Changed

- The Synthea recipe and Cohort Studio moved, with their history, to
  [opentwin-synthea](https://github.com/Opening-Science/opentwin-synthea)
  (#228). The recipe there includes the reproducibility fix from #218.

[Unreleased]: https://github.com/Opening-Science/open-twin/commits/main
