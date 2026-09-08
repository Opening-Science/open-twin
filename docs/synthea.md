# Synthea cohort generation

Synthetic FHIR R4 patients for local Route B work (structured FHIR at build
time). Inventory of Anchor LOINC coverage lives in
[findings/synthea-coverage.md](findings/synthea-coverage.md) — this document is
only the **generator recipe**.

## Why the cohort is not committed

N=100 Synthea FHIR patients are hundreds of megabytes, unreviewable as diffs,
and go stale when config changes. The repo stores a pinned JAR checksum, export
config, fixed seeds, and a generation script. Anyone with Java 21+ can
reproduce the same patient IDs.

Optional distribution of a pre-built N=100 artifact (GitHub Release vs Git LFS)
is a maintainer decision — not part of this recipe.

## Generate

```bash
./tools/synthea/generate.sh
```

Defaults: Synthea **v4.0.0**, seed **42**, clinician seed **43**, N=**100**,
Massachusetts, FHIR R4 only. Output: `tools/synthea/out/` (gitignored), plus
`out/manifest.json` with seeds, version, config hash, and patient file count.

Override with `SYNTHEA_POPULATION`, `SYNTHEA_SEED`, `SYNTHEA_CLINICIAN_SEED`,
`SYNTHEA_STATE`.

## CI without Java

`packages/fhir-r4/src/tests/fixtures/synthea/` holds three trimmed patient
bundles so fixture tests run without downloading Synthea or requiring a JVM.
