# Changelog

Notable changes to open-twin. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). How releases are made is described
under [Releases](Contributing.md#releases).

## [Unreleased]

### Added

- `@open-twin/reader-core`: the reader types and `IHealthDataReader`, with the
  host `TokenStore` and `CursorStore` interfaces from D8 (#232, decision D16).

### Changed

- Public packages can be released and versioned independently with Changesets.
  Shared core remains a regular compatible dependency; packed artifacts are
  checked in clean external npm consumers (#265).
- Public FHIR declaration imports use Node ESM-compatible `fhir/r4.js`
  specifiers. Google Health and VITRONIC declare the Node types exposed by their
  public declarations. These packaging fixes do not alter mapping behavior.

- The Synthea recipe and Cohort Studio moved, with their history, to
  [opentwin-synthea](https://github.com/Opening-Science/opentwin-synthea)
  (#228). The recipe there includes the reproducibility fix from #218.

[Unreleased]: https://github.com/Opening-Science/open-twin/commits/main
