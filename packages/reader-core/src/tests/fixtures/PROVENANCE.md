# Fixture provenance

`synthetic.steps.json` is a hand-written synthetic file in a format that exists only
for the reader-core tests. There is no vendor, no device and no person behind it.
The second day deliberately has no step count, so the conformance suite can tell a
reader that records the absence from one that writes 0.

`expected.json` is the `summarise` output for that file as read by `FakeStepsReader`
on `2026-11-03`; regenerate it with `summarise` when the fixture changes, never by hand.
