# @open-twin/aggregate

Takes bundles from several connectors for **one subject** and returns one bundle,
with overlaps reconciled. This is the layer that answers "Oura and Google Health
both reported last night's sleep — which number do we stand behind?"

Two rules hold it together, and both are about not destroying evidence:

1. **Every source Observation survives.** A reconciliation is an added assertion,
   not a replacement, so changing the selection policy later is a re-run over data
   already held — not a re-fetch from a vendor who may no longer serve the window.
2. **Where the evidence gives no basis to prefer a source, none is preferred.**
   The output then says several sources disagreed, and no more. That is the truth.

## Installation

After the package's first npm release:

```bash
npm install @open-twin/aggregate
```

Core is installed as a compatible shared dependency; connectors are not installed.
This package is versioned independently. See [publishing](../../docs/PUBLISHING.md).

## What a reconciliation is

When more than one connector reports the same **measure** on the same **day**, the
aggregator consults `reliabilityFor` in `@open-twin/fhir-core` — graded validation
evidence per _(source, measure)_ pair, with citations — and either:

- emits a **derived Observation** carrying `derivedFrom` pointing at _every_ source
  it considered (not only the winner) and `method` stating the policy in prose, or
- **abstains**, recording why. The abstentions are the substance:
  - _energy expenditure_ abstains outright — published MAPE above 30% for every
    brand tested, so naming a winner would present a confidence nobody has earned;
  - _equally graded sources_ abstain rather than break a tie on array order;
  - _several same-day readings from the preferred source_ abstain because the
    reliability evidence ranks connectors, not readings within one connector;
  - _a single reporting source_ is not a disagreement, so nothing is asserted.

A selection nobody can audit is indistinguishable from a guess, which is why the
policy prose and the citation ride inside the bundle.

The integrator must verify that grouped measurements are comparable. The current
measure/day grouping does not establish matching units, measurement windows or
measurement equivalence. Source selection is experimental; see the
[intended-use guidance](../../docs/INTENDED-USE.md).

## Usage

```ts
import { aggregate } from '@open-twin/aggregate';

const { bundle, reconciliations } = aggregate({
  sources: [
    { bundle: ouraBundle }, // connector read from meta.tag when present
    { connector: 'google-health', bundle: googleBundle }
  ],
  subjectKey: 'user-42',
  timestamp: '2026-06-21T08:00:00Z' // supplied, so the result is reproducible
});

for (const r of reconciliations) {
  // { measure, day, sources, selected?, policy } — one line per overlap,
  // including the overlaps where nothing was selected and why.
}
```

## Preconditions: one subject and canonical source ids

Each connector mints its own `urn:uuid:` subject from its own key unless the
integrator supplies a common one (decision D1). Left alone, nothing would match and
the aggregator would report no overlap — a wrong answer that looks like a clean one.
So `aggregate` **throws** when its sources carry more than one subject reference:
supply the same `subject` to every connector for the same person before aggregating.

Every Observation participating in a derived result must also carry a lowercase
UUID `id`. Connector bundles built with `buildBundle` already satisfy this. A foreign
id-less bundle must be normalised first; aggregation refuses it rather than emitting
an unresolved `urn:uuid:undefined` provenance reference.

## Where the grades come from

`reliability.ts` in `@open-twin/fhir-core` records what the validation literature
says, per source and measure — not a preference order. That distinction does real
work: sleep _duration_ selects google-health over Oura, because Oura's `good` grade
is for sleep–wake _detection_ and it has no published total-sleep-time finding at
all. Extending the table is a citation, not an opinion.

## The measurement catalogue

`createMeasurementCatalogue` combines the declarations of the connectors you register
into one catalogue, grouped by measurement key. It needs no credentials, network or
bundles — only the declaration sets the connector packages export — so it can be built
before any data is fetched, and aggregate needs none of the connectors installed.

```ts
import { createMeasurementCatalogue, sharedCatalogueEntries } from '@open-twin/aggregate';
import { GOOGLE_HEALTH_MEASUREMENTS } from '@open-twin/provider-google-health';
import { OURA_MEASUREMENTS } from '@open-twin/provider-oura';

// Registration order is kept and is the only order used; nothing here ranks sources.
const catalogue = createMeasurementCatalogue([OURA_MEASUREMENTS, GOOGLE_HEALTH_MEASUREMENTS]);

sharedCatalogueEntries(catalogue); // keys two or more registered sources declare
```

Every key a registered connector declares is in the catalogue. A key declared by one
source has `shared: false`; a key declared by two or more has `shared: true` — the keys
a source preference can later apply to. The catalogue describes **supported
capabilities**, not what any bundle contains: matching keys makes two sources
candidates, and whether two actual readings are comparable (unit, context, subject,
time window) is still decided per reading.

Registration fails with a `ConnectorError` listing every problem — a connector
registered twice, a declaration whose unit or context differs from its definition, a
key borrowed from another connector's namespace.

The catalogue is additive for now: `aggregate()` still groups by the `measureOf`
table and selects by reliability grade, until reconciliation moves onto the
catalogue (#264).

## User-owned source preferences

Generate configuration from the catalogue before fetching any data:

```ts
import {
  generateReconciliationConfiguration,
  type ReconciliationConfiguration,
  validateReconciliationConfiguration
} from '@open-twin/aggregate';

const configuration = generateReconciliationConfiguration(catalogue);
// { version: 1, measurements: {
//   'total-sleep-time': {
//     sourcePriority: ['oura', 'google-health'], missingData: 'strict'
//   }, ... } }

const sleep = configuration.measurements['total-sleep-time'];
if (sleep) {
  sleep.sourcePriority = ['google-health', 'oura'];
  sleep.missingData = 'fallback';
}

// The application owns JSON storage and handles JSON.parse syntax errors.
const saved = JSON.stringify(configuration);
const decoded: ReconciliationConfiguration = JSON.parse(saved);
const result = validateReconciliationConfiguration(decoded, catalogue);
if (!result.ok) {
  // Each problem has a stable code, JSON Pointer path, and explanatory message.
  throw new Error(result.problems.map((problem) => `${problem.path}: ${problem.message}`).join('; '));
}
const restored = result.configuration; // typed ReconciliationConfiguration
```

Only keys declared by at least two registered sources receive entries. Defaults
list supporting sources in registration order, with the first source preferred
and `missingData: 'strict'`. Strict preference means using only that first source;
`fallback` permits trying the remaining listed sources in order when earlier
sources have no eligible value. These modes describe the configuration contract;
this API does not yet execute source selection.

Users may reorder or remove sources, but each priority list must remain nonempty
and contain no duplicates. Every listed source must declare that particular key.
Every shared key requires an entry; unknown keys and single-source keys are
errors. Unsupported versions, malformed fields, unknown fields, and invalid modes
are errors too. Validation accepts `ReconciliationConfiguration`, returns either
`{ ok: true, configuration }` or `{ ok: false, problems }`, and never mutates
input, supplies missing defaults, or silently rewrites preferences. A successful
result is an independent copy. JSON round trips preserve priorities and modes.
The typed parameter provides compile-time checks for application-authored
configuration; runtime checks remain because JSON parsing does not verify its type.

Validation alone never appends supporting sources. To update saved preferences
after registrations change, use the explicit update operation below.

These are user preferences, not reliability grades or evidence of clinical
validity. Like the catalogue, these APIs are additive: `aggregate()` still uses
its existing reliability-based selection until the remaining #264 work lands.

### Updating configuration after capability changes

Persist the complete catalogue snapshot alongside its configuration. The update
API needs both the previous and next catalogues to distinguish newly available
sources from sources the user intentionally excluded. Rebuilding the previous
catalogue from upgraded connector packages loses that baseline.

```ts
import { updateReconciliationConfiguration } from '@open-twin/aggregate';

// previousCatalogue and configuration are the paired, saved JSON snapshots.
// nextCatalogue is built explicitly from the new connector registrations.
const update = updateReconciliationConfiguration(configuration, previousCatalogue, nextCatalogue);

if (update.ok && update.proposedConfiguration) {
  // Preview update.changes, then let the application save the proposal and
  // nextCatalogue together. The library writes nothing.
} else {
  // update.conflicts lists changes requiring explicit review/resolution.
  // update.problems lists configuration validation errors.
  // Do not use a blocked proposal as active configuration.
}
```

The operation preserves existing priority order, source exclusions, and
missing-data modes. Genuinely new supporting sources are appended in the next
catalogue's registration order, never promoted above an existing preference.
New shared keys, including previously unique keys, receive strict defaults in
that order. New single-source keys receive no preference.

`changes` contains stable codes, measurement keys and connector ids, never
readings. It reports `measurement-added`, `measurement-removed`, `became-shared`,
`no-longer-shared`, `source-added` and `source-removed`. Source changes are
per measurement: a connector can stop supporting one key while retaining another.
Removed measurements also report every removed supporting source.

`conflicts` is the subset of changes with `requiresResolution: true`:

- Removed configured measurements, shared-to-unique transitions, and removal
  of **any listed source**, including a fallback, block the proposal. A removed
  excluded source or a removed unique measurement is informational.
- Definition changes (`description`, value type, canonical unit or context) and
  declaration changes (coding, location/parent coding, value type, unit or
  context, including added/removed declarations for an existing source/key)
  are conservatively incompatible and require review, even on an excluded
  source or unique key. Editorial definition changes also require review.
- `schema-changed` blocks the operation without interpreting the new schema.
  Definition-set and connector version bumps alone are informational metadata:
  actual contents are compared, even if a publisher forgot to bump a version.
  Declaration order, object property order and connector reordering are not
  semantic changes.

A blocked proposal retains obsolete preferences rather than pruning them or
silently choosing a new preferred source. Resolve structural conflicts by
explicitly editing/removing those entries, then call
`validateReconciliationConfiguration` against the next catalogue. Semantic
conflicts require the application to review and explicitly accept the changed
meaning or migrate the preferences; structural validation alone does **not**
resolve them. Schema changes require a supported schema migration, not merely
validation. No resolution, acceptance or persistence happens implicitly.

The result has `ok: true` only for a valid, conflict-free proposal. If the saved
configuration fails validation against the **previous** catalogue, `ok` is false,
`proposedConfiguration` is null, and `problems` explains why; fix the baseline
before updating. Otherwise the proposal is an independently editable copy,
including on conflict. Inputs are never mutated. Both catalogues must be complete
snapshots from `createMeasurementCatalogue` or their JSON round trips.
This operation needs no bundles, credentials or network and is never called
silently during reconciliation.

## Verification

`src/verification/exampleBundle.ts` emits a two-source bundle — one reconciled
measure, one abstention — that runs through the HL7 validator in CI like every
other emitted bundle (`pnpm emit-bundles out/`).
