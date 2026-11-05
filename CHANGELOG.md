# Changelog

Notable changes to open-twin. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). How releases are made is described
under [Releases](Contributing.md#releases).

## [Unreleased]

### Added

- `@open-twin/reader-core`: the reader types and `IHealthDataReader`, with the
  host `TokenStore` and `CursorStore` interfaces from D8 (#232, decision D16).
- `@open-twin/reader-core`: the `HealthDataReader` base class adapters extend
  (#251).
- `@open-twin/reader-core`: the eight conformance rules as plain checks, and
  `summarise`, which an adapter's `expected.json` records (#252).

### Changed

- The Synthea recipe and Cohort Studio moved, with their history, to
  [opentwin-synthea](https://github.com/Opening-Science/opentwin-synthea)
  (#228). The recipe there includes the reproducibility fix from #218.

[Unreleased]: https://github.com/Opening-Science/open-twin/commits/main
