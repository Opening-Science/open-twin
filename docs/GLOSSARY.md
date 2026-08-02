# Glossary

Domain terms used in code, defined once. Prefer linking here from headers via
`GOVERNED BY` only when the term is the contract; otherwise keep definitions in
the module that owns the symbol.

| Term | Meaning |
|---|---|
| Bundle | FHIR R4 `Bundle` of resources emitted by a connector or aggregate |
| Connector | Package that turns a vendor or clinical format into FHIR |
| `SYSTEMS` | Canonical code-system and identifier URIs in `@open-twin/fhir-core` |
| `LOINC_UNITS` | One UCUM `(unit, code)` pair per LOINC concept (D4) |
| Allowlist | `verify/terminology-allowlist.json` — signed LOINC/SNOMED review store |
| Unit gate | `verify/check-units.mjs` — UCUM grammar + name/code pairing |
| Observation | FHIR R4 `Observation`; clinical fact with optional `valueQuantity` |
| `dataAbsentReason` | FHIR coding used when a value is missing — never invent `0` |
| Subject | `Reference` to the patient; caller-supplied or deterministic URN (D1) |
| Aggregate | Cross-source reconciliation that may add a derived Observation or abstain |
| OperationOutcome | FHIR issues list; partial failure surface (D6) |
| UCUM | Unified Code for Units of Measure |
| HL7 validator | Official `validator_cli.jar` run in CI over emitted bundles |
| Vendor-local code | Code under a Foundation-controlled `SYSTEMS.*` connector namespace |
| `ConnectorError` | Typed error without response body / PHI |
| `SystemId` | Nine-value anatomy region enum owned by open-twin-openXR; consumed here (D12) |
| Interpretation document | v0.2 contract JSON consumed by XR; never carries recommendations (D-m) |
| Rule-support | `confidence` = completeness × recency × rule_strength — not disease probability (D-j) |
| `unrenderable[]` | States with no SystemId home; never dropped or rerouted (D12) |
