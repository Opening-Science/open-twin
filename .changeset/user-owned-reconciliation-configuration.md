---
"@open-twin/aggregate": minor
---

Add a versioned, JSON-serializable source preference configuration with offline
generation from the measurement catalogue and runtime validation of saved input.
Defaults follow connector registration order and use strict missing-data handling.
Users can reorder or exclude sources and enable fallback per shared measurement.
Existing aggregation and selection behavior is unchanged.
Non-enumerable measurement keys do not satisfy required shared-key coverage.
