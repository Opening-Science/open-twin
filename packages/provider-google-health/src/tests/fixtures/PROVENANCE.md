# Where `google-health-sync.json` came from

The Google Health API has no sandbox (see the package README, point 4), so there is no
capture to replay. These are the same records as `src/verification/exampleBundle.ts`,
one `dataPoints.list` page per type. They are shaped from real responses: int64 fields
as JSON strings, lengths in millimetres, mass in grams, and a `utcOffset` on every
timestamp.

The step count is the empty string on purpose. The mapper must record it as
`dataAbsentReason`, so `absentValues` in the expected summary is 1, not 0.

No person is behind these records. The user id is the one the mapper tests use.

`google-health-sync.expected.json` is `summarise(bundle)` from a checked reader run on a
fixed clock; regenerate it when the fixture or a mapper changes, never by hand.
