---
"@open-twin/aggregate": minor
"@open-twin/fhir-core": minor
---

BREAKING: removes the legacy reliability policy. `@open-twin/fhir-core` no longer
exports `reliabilityFor`, `RELIABILITY`, `ReliabilityFinding` or `ReliabilityGrade`.
`@open-twin/aggregate` no longer exports `selectSource`, `Candidate`, `Selection`,
`measureOf`, `Measure`, `effectiveDay` or `occasionKey`. Use measurement
declarations, `createMeasurementCatalogue` and a saved reconciliation configuration
instead; see the aggregate README's migration section.
