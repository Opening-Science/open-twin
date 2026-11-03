# @open-twin/provider-anchor

Research module: turns laboratory biomarker measurements, keyed by the Anchor catalogue
in `@open-twin/anchor-layer`, into FHIR R4 Observations with the catalogue's reference
intervals. Ingestion layer (D14); interpretation stays in `@open-twin/interpreter`.

Entry points: `buildCollectionBundle({ context, measurements, bundleTimestamp })` and
`mapBiomarkerToObservation`. Measurements name a `biomarker_id`, a value and a UCUM unit.
Marker-class fixtures live in `src/fixtures/markerClasses.ts`; the verification bundles
`anchor-hba1c` and `anchor-<class>` run through the HL7 validator in CI.

Registry id `anchor`, status `research` (see [docs/registry.md](../../docs/registry.md)).
Research and non-medical consumer wellness only; see [INTENDED-USE](../../docs/INTENDED-USE.md).
