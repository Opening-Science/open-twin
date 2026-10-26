# Cohort Studio

A small local web app for building a **synthetic** patient cohort with
[Synthea](https://github.com/synthetichealth/synthea): click the cohort together,
run it reproducibly, and look at what came out.

Every person it produces is made up by a simulator. The data is for research
and software testing only. It says nothing about real people and is not
clinically validated; see [intended use](../../docs/INTENDED-USE.md).

## Start

Needs Node 22.13+ (for the page's TypeScript), pnpm and Java 21+.

```bash
pnpm install
pnpm studio            # http://127.0.0.1:4400  (COHORT_STUDIO_PORT=4401 pnpm studio for another port)
```

The server listens on 127.0.0.1 only. If the pinned Synthea JAR is not in
`tools/synthea/.cache/` yet, the page offers to download it and checks it
against the sha256 in `tools/synthea/version.lock`.

## What it does

1. **Build.** Population ("people to keep": living people at the end; people who
   died during the simulation are kept as extra records), seeds, state and
   city, age range, sex, and fixed reference and end dates (default
   2026-01-01, never today's date).
   The **condition picker** lists every SNOMED CT code that a `ConditionOnset`
   state in the JAR's built-in modules can start (386 codes in v4.0.0, read
   from the JAR at start-up, not stored in this repository), grouped and
   searchable. Choosing conditions generates a keep module (GMF v2): "any of"
   is an `Or`, "all of" an `And` of `Active Condition` checks. A condition
   marked *can end* is one Synthea may resolve; only people who still have it
   at the end are kept. Module Builder exports can be added as custom modules
   (passed to Synthea with `-d`).
   The recipe panel shows the exact recipe, its hash, a time estimate, the
   generated keep module and the equivalent `generate.sh` call, with buttons to
   download, load or paste a recipe and copy the command that reruns it.
2. **Run.** One run at a time, through `tools/synthea/generate.sh`, into
   `tools/cohort-studio/runs/<runId>/` (gitignored). Synthea's output streams to
   the page; a run can be cancelled. At the end it shows records (total, alive,
   died), files, size, the content checksum and the manifest.
3. **Explore.** A plain-language overview of a finished run (ages, visit types,
   most common diagnoses, medicines and measurements as a share of people,
   visits per year) and a searchable people table with a one-person view.

Each run folder holds `recipe.json`, `inputs/` (keep module, custom modules),
`out/` (Synthea's `fhir/` and generate.sh's `manifest.json`, with a copy of the
keep module and custom modules), `run.json` (recipe plus results) and
`log.txt`.

## Recipe format

```json
{
  "format": "open-twin-cohort-recipe/1",
  "synthea": { "version": "v4.0.0", "jarSha256": "…", "configSha256": "…" },
  "population": 20,
  "seed": 42,
  "clinicianSeed": 43,
  "state": "Massachusetts",
  "city": null,
  "age": { "min": 40, "max": 75 },
  "sex": "any",
  "referenceDate": "2026-01-01",
  "endDate": "2026-01-01",
  "conditions": {
    "match": "any",
    "chosen": [
      { "code": "44054006", "display": "Diabetes mellitus type 2 (disorder)" },
      { "code": "59621000", "display": "Essential hypertension (disorder)" }
    ]
  },
  "keepModuleSha256": "…",
  "customModules": [{ "name": "my_module.json", "sha256": "…", "module": { "…": "…" } }],
  "recipeSha256": "…"
}
```

`sex` is `any`, `F` or `M`; `age` is `null` for all ages. `configSha256` is the
sha256 of `synthea.properties` followed by `version.lock` (the manifest's
`configHash`). `recipeSha256` covers every other field; custom modules are
covered through their sha256. Limits: 1–10,000 people, ages 0–140, dates
1900–2100, at most 50 conditions and 20 custom modules.

Rerun a downloaded recipe without the page, from the repository root:

```bash
pnpm cohort cohort-recipe-<hash>.json            # into tools/cohort-studio/runs/<runId>/
pnpm cohort cohort-recipe-<hash>.json --out dir  # into an empty folder of your choice
```

## Reproducibility

The same recipe with the same Synthea version, the same JAR (sha256) and the
same `synthea.properties` gives byte-identical patient files. Runs go through
`generate.sh`, which fixes the dates, runs Java in UTC and Synthea on one
thread; see [docs/synthea.md](../../docs/synthea.md#reproducibility). The
content checksum equals `cd out/fhir && sha256sum *.json | sort | sha256sum`.

Check it on your machine (Java and the JAR needed; not part of `pnpm test`):

```bash
pnpm --filter @open-twin/cohort-studio repro            # 50 people, 3 runs, 3 folders
pnpm --filter @open-twin/cohort-studio repro --population 100 --runs 2 --keep
```

It runs 50 people aged 40–75 with hypertension or type 2 diabetes three times
into separate folders and fails unless all checksums match.

The guarantee stops there. A different Synthea release, JAR or settings file
gives different people, and the studio warns when a loaded recipe was written
for another version. Recipes made with "now" as the date cannot be reproduced.

## Timing

Synthea runs on one thread for reproducibility. On the machine this was built
on: about 10 s start-up, then about 21 s per 100 people without conditions
(100 people in 31 s); 50 people aged 40–75 with hypertension or type 2 diabetes
took about 45 s. Rare conditions, narrow age ranges or "all of" make Synthea
simulate and discard many more people, and Synthea gives up after 1,000 tries
per person. Estimates on the page use your own earlier runs once there are
some.

## Fonts

The page is set in Selecta and ABC Diatype Semi Mono, the foundation's fonts.
Both are commercial and are not in this repository. The page uses them when
they are installed on your computer, or when their files are in
`tools/cohort-studio/fonts/` (gitignored): `Selecta-Regular.woff2`,
`Selecta-Medium.woff2`, `Selecta-Bold.woff2`, `ABCDiatypeSemiMono-Regular.woff2`
and `ABCDiatypeSemiMono-Bold.woff2`. Without them it falls back to the system
fonts.

## Development

```bash
pnpm --filter @open-twin/cohort-studio test   # unit tests (no Java needed)
pnpm --filter @open-twin/cohort-studio exec tsc --noEmit
pnpm lint
```

The page (`src/client/app.ts`) is TypeScript served with types stripped by
Node's `stripTypeScriptTypes`, so it uses erasable syntax only and no imports.
No frontend framework and no runtime dependencies beyond Node and tsx.
