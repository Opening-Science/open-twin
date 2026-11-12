---

"@open-twin/fhir-core": patch
"@open-twin/aggregate": patch
"@open-twin/reader-core": patch
"@open-twin/provider-oura": patch
"@open-twin/provider-whoop": patch
"@open-twin/provider-google-health": patch
"@open-twin/provider-vitronic": patch
"@open-twin/open-wearables": patch
"@open-twin/fhir-r4": patch
"@open-twin/hl7v2": patch
"@open-twin/genomics-vcf": patch
---

Prepare independently installable npm packages with compatible shared core
dependencies, complete publication metadata, and verified runtime and TypeScript
exports. Packages retain their existing APIs and mapping behavior.

Use Node ESM-compatible FHIR type specifiers and include exposed Node type
dependencies so strict TypeScript consumers work outside the workspace.

Support manual package selection in GitHub Actions, with approved automated
signed tags and publication of only the verified selected artifact.
