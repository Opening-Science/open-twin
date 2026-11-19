# @open-twin/aggregate

Takes bundles from several connectors for **one subject** and returns one collection
bundle. Basic bundling is the default. Reconciliation is optional and applies
user-owned source preferences to comparable, declared measurements.

Two rules hold it together, and both are about not destroying evidence:

1. **Every source Observation survives.** A reconciliation is an added assertion,
   not a replacement, so changing the selection policy later is a re-run over data
   already held — not a re-fetch from a vendor who may no longer serve the window.
2. **No implicit source preference.** Without explicit enablement, no selection
   decisions or derived reconciliation Observations are created. Configured
   preferences are not reliability grades or claims of clinical superiority.

## Installation

After the package's first npm release:

```bash
npm install @open-twin/aggregate
```

Core is installed as a compatible shared dependency; connectors are not installed.
This package is versioned independently. See [publishing](../../docs/PUBLISHING.md).

## What a reconciliation is

With reconciliation enabled, aggregate discovers occasions for catalogue-shared keys
from source observations. An occasion is an exact subject reference, measurement
context, and normalized instant or complete period. Equal dates, overlapping
periods, similar names and commensurable units do not establish comparability.

For each occasion:

- **Strict** checks only the first configured source.
- **Fallback** tries listed sources in order until one has exactly one eligible
  reading. Sources with no eligible reading are skipped.
- Multiple eligible readings or an ambiguous declaration at an inspected source
  cause immediate abstention, never arbitrary selection or fallback past ambiguity.

A successful selection adds one measurement-level Observation. Its `derivedFrom`
references the distinct original Observations considered, including nonselected
sources, and `method.text` explains the configured preference.
Component selections copy that component's coding, value, interpretation and
reference range, not the parent panel's unrelated values.
Fragment references in retained metadata keep their required contained targets,
including transitive references. Unrelated panel-only contained resources are not
copied. Back-references to the source container remain references to the original
Observation, not the new assertion. Missing or ambiguous contained targets are
explicit validation errors.
Relative references in derived metadata, including retained contained resources,
are rebased to their original absolute targets. This does not rewrite the originals.
The derived `effective[x]` keeps the selected source's original type, offset,
fractional precision and period metadata; normalized windows are only for comparison,
decision reporting and deterministic identity.

The configured policy applies even if only one declared source returns data.
Unique and undeclared measurements are carried without selection.
Source selection remains experimental; see the
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

// reconciliations is []; no source selection was requested.
```

To enable reconciliation, build the catalogue and generate or restore configuration
as shown below, then pass both explicitly:

```ts
const result = aggregate({
  sources: [{ bundle: ouraBundle }, { bundle: googleBundle }],
  subjectKey: 'user-42',
  timestamp: '2026-06-21T08:00:00Z',
  reconciliation: { enabled: true, catalogue, configuration }
});

for (const decision of result.reconciliations) {
  // key, window, sources, selected?, outcome, reason, attempts, policy
  // outcome: selected | fallback | abstained
  // attempts: connector, eligibleCount, ineligibleReasons, reason
}
```

Missing or invalid enabled configuration throws a payload-free validation
`ConnectorError`, including for empty bundles. Runtime never generates defaults,
updates preferences, writes files or consults the legacy reliability table.
Omitting `reconciliation`, or passing `{ enabled: false }`, performs basic bundling.

### Discovery and diagnostics

Timezones are normalized while retaining fractional seconds beyond milliseconds.
Daily, session and sleep summaries require complete period boundaries; aggregate
does not invent midnight, convert date markers to windows or infer a tolerance.
Missing values still establish occasions when subject and timing are known, so
strict abstention and fallback remain visible.

`reconciliationStatus` is `disabled`, `no-occasions`, or `completed`. Completely empty
data cannot establish occasions; it produces no invented per-window decisions.
`issues` reports undeclared values, unregistered connectors, ambiguous declarations,
missing subjects and missing/invalid times using codes, registered keys and original
input positions, not health values. A `no-occasions` result can still contain issues.
The decisions and output bundle themselves contain measurement metadata; treat them
as potentially sensitive and do not log resource payloads.

## Preconditions: one subject and preserved addresses

Each connector mints its own `urn:uuid:` subject from its own key unless the
integrator supplies a common one (decision D1). Left alone, nothing would match and
the aggregator would report no overlap — a wrong answer that looks like a clean one.
So `aggregate` **throws** when its sources carry more than one subject reference:
supply the same `subject` to every connector for the same person before aggregating.
Fragment subjects such as `#person` are local to their containing Observation:
identical fragment labels in different Observations do not establish patient identity.
Relative subjects such as `Patient/person` resolve against their containing entry's
RESTful `fullUrl`, so matching ids on different servers or service roots are different
subjects. Relative and absolute spellings of the same resolved address match.
A relative subject with a missing, opaque or non-RESTful source address is rejected
on both paths: supply a common absolute reference or `urn:uuid:` identity instead
of relying on an inferred server base.

Both paths preserve original resource ids and entry `fullUrl`s, including foreign
non-UUID ids and absolute URLs. They retain Patient, Device and existing derived
resources without rewriting their references or mutating inputs. Identical resources
at the same address are coalesced; conflicting resources at an address are validation
errors. Source transaction/search entry instructions are not copied into the output
collection.

Every Observation considered for a successful derived result must have a `fullUrl`.
Connector bundles built with `buildBundle` already satisfy this. An unaddressable
source causes an explicit error rather than unresolved provenance. Basic bundling
does not require a measurement to be addressable or declared.

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

For a complete, reviewable workflow, run the
[Oura + Google Health example](examples/oura-google-catalogue.ts) from the repository
root after building the workspace packages:

```bash
pnpm --filter @open-twin/aggregate exec tsx examples/oura-google-catalogue.ts
```

This writes six working files plus an initial timestamped configuration snapshot
to `out/oura-google-aggregation/` at the repository root.
An optional directory argument overrides that location (relative paths are relative
to the command's working directory, which `pnpm --filter` sets to the package):

| File                                | Review                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `catalogue.json`                    | Every declared key, definition, context, unit, source selector and `shared` flag.                     |
| `reconciliation-configuration.json` | Preferences for all shared keys; initially Oura first and `strict`.                                   |
| `configuration-history/`            | Initial generated defaults, saved with a timestamp and unique suffix.                                 |
| `oura-bundle.json`                  | One synthetic sleep period, mapped by the Oura connector.                                             |
| `google-health-bundle.json`         | The same period plus a second Google-only night, mapped by Google Health.                             |
| `basic-result.json`                 | Default aggregation: original resources, no source selection.                                         |
| `reconciled-result.json`            | Enabled aggregation: original resources plus derived selections, decisions, attempts and diagnostics. |

Everything is synthetic and offline. Catalogue, configuration and bundle content
are deterministic; snapshot filenames reflect the save time. The catalogue uses real
connector exports; fixture mapping uses the actual connector builders, including
Oura's internal map-only builder, so this is a checkout example rather than a
standalone published-package integration. Both connectors receive the same explicit
subject reference; supplying only the same `subjectKey` would not link their
connector-scoped default identities. Google Health means the cloud API v4 connector,
not Android Health Connect. These outputs demonstrate mechanics, not clinical validity.

For `deep-sleep-duration`, the first night has 60 minutes from Oura (converted by its
mapper from 3,600 seconds) and 70 from Google. Default strict preferences select
Oura. The second night has only Google's 80 minutes, so strict preference abstains.

Edit **the existing entry**, retaining all other shared-key preferences, in
`reconciliation-configuration.json`:

```json
"deep-sleep-duration": {
  "sourcePriority": ["oura", "google-health"],
  "missingData": "fallback"
}
```

Rerun the same command. The first night still selects Oura; the second now falls
back to Google. Reverse `sourcePriority` to prefer Google's 70 minutes on the first
night instead. Generated defaults reflect registration order, not reliability.

Reruns validate and reuse the saved configuration without overwriting it. Malformed
or incompatible configuration fails explicitly before outputs are rewritten.
The history snapshot is created only when the example generates initial defaults,
not on reruns that reuse an existing working configuration. Editing the working file
does not automatically snapshot those edits.
Other output files are regenerated, including the synthetic source bundles.
The catalogue itself remains capability metadata and never selects a source;
the example explicitly enables reconciliation with the saved configuration.

Every key a registered connector declares is in the catalogue. A key declared by one
source has `shared: false`; a key declared by two or more has `shared: true` — the keys
a source preference can later apply to. The catalogue describes **supported
capabilities**, not what any bundle contains: matching keys makes two sources
candidates, and whether two actual readings are comparable (unit, context, subject,
time window) is still decided per reading.

Registration fails with a `ConnectorError` listing every problem — a connector
registered twice, a declaration whose unit or context differs from its definition, a
key borrowed from another connector's namespace.

### Runtime measurement resolution and eligibility

`resolveReadings` uses the registered declarations, not the legacy measurement
table, to find values in source bundles and assess them for an explicit request.
It supports Observation values and components matched by their coding **and** their
parent's coding; component order is irrelevant.

```ts
import { resolveReadings } from '@open-twin/aggregate';

const result = resolveReadings({
  catalogue,
  sources: [
    { connector: 'oura', bundle: ouraBundle },
    { connector: 'google-health', bundle: googleBundle }
  ],
  request: {
    key: 'total-sleep-time',
    subject: 'https://example.test/fhir/Patient/example', // exact resolved subject identity
    context: { scope: 'sleep-period', statistic: 'total' },
    window: {
      kind: 'period',
      start: '2026-06-20T22:00:00Z',
      end: '2026-06-21T06:00:00Z'
    }
  }
});

for (const { reading, eligibility } of result.readings) {
  // reading keeps the original Observation and, when applicable, its component.
  // eligibility is { kind: 'eligible' } or { kind: 'ineligible', reasons: [...] }.
  // Keep the reading for selection/provenance; do not log its health payload.
}
// result.issues reports undeclared values, ambiguous declaration matches and
// unregistered connectors using input positions, never payloads or subject ids.
```

Eligibility requires a present value of the declared type, its exact emitted UCUM
unit, the declared scope/statistic, the exact subject reference, and a compatible
effective time. A missing numeric value, `dataAbsentReason`, nonfinite number or
quantity comparator is not an exact usable reading. Zero and boolean `false` are
valid values. A parent's absent score does not make its populated components absent.
A value-less panel (`valueType: 'none'`) is not itself a usable reading.

Registered (no result yet), cancelled and entered-in-error Observations are
ineligible, including their components, with `unusable-status`. Preliminary and
unknown statuses are not excluded solely for their status: eligibility is not
confirmation that a result is final or verified.

Ranges, ratios and sampled-data origins must be unitless. The declaration schema
cannot describe their nested units yet, so any `unit`, `system` or `code` on those
nested quantities makes the reading ineligible with `unit-mismatch`, even when
both range bounds use the same unit. No unit compatibility or conversion is inferred.

Value checks also reject out-of-range/fractional integers, reversed ranges,
incompatible range-bound units, zero ratio denominators and malformed temporal or
sampled-data values. Sampled data needs a finite origin, positive sampling period,
valid dimensions, complete sample groups and valid numeric/error/limit tokens;
error/limit tokens alone provide no usable numeric value. Partial dates and open
periods remain valid **values** where FHIR permits them, but cannot serve as complete
effective measurement windows. These eligibility guards are not a full FHIR
structural validator; see the [R4 datatype definitions](https://hl7.org/fhir/R4/datatypes.html)
and [observation statuses](https://hl7.org/fhir/R4/valueset-observation-status.html).

Time compatibility is deliberately conservative:

- Individual readings accept `{ kind: 'instant', at: '...' }` or a complete period.
  Summaries (daily, interval, session, sleep period or physiological cycle) require
  periods; declaration context alone does not establish a measurement window.
- Instants must match exactly; periods must have identical start and end instants,
  with end after start. Offsets are normalized and fractional seconds are preserved.
  Mere overlap or a shared calendar date is insufficient.
- Effective times require a complete date, hours, minutes, seconds and an explicit timezone.
  Date-only markers, incomplete/open periods, `effectiveTiming`, conflicting
  `effective[x]` fields, impossible dates and unsupported leap seconds are ineligible.
  No day boundaries, timezones or tolerances are inferred. Connectors emitting only
  daily markers or a sleep start cannot establish comparable periods with this API.

The resolver never converts a unit, matches different patient references, selects
a source or mutates a bundle/catalogue. It checks matching against **all** of a
source's declarations before filtering by the requested key, so ambiguous codings
cannot turn into an arbitrary match. Multiple same-source readings remain separate
for the selection layer to handle. An empty bundle returns no readings; the
catalogue still records that source's capability. Invalid requests throw a
payload-free `ConnectorError`; eligibility reasons and resolution issues contain
only diagnostic codes, registered declaration keys and input positions, not health
values. Each resolution issue includes `matchedKeys`: the sorted, unique keys of
all matched declarations, including keys other than the requested one. Unmatched
elements and unregistered connectors have an empty `matchedKeys` array.

The same declaration inventory and precise time rules drive automatic discovery in
enabled `aggregate()`. The explicit `resolveReadings` API remains available for
assessing a caller-supplied request without selecting a source.
Its subject is compared with each reading's resolved identity, not an unqualified
relative string. A fragment's comparison identity is its containing `fullUrl` plus
the fragment; this is a scoped comparison key, not an external link to a contained
resource. A subject that cannot be resolved is ineligible with `subject-mismatch`.

## User-owned source preferences

Generate configuration from the catalogue before fetching any data:

```ts
import { generateReconciliationConfiguration, validateReconciliationConfiguration } from '@open-twin/aggregate';

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
const decoded: unknown = JSON.parse(saved);
const result = validateReconciliationConfiguration(decoded, catalogue);
if (!result.ok) {
  // Each problem has a stable code, JSON Pointer path, and explanatory message.
  throw new Error(result.problems.map((problem) => `${problem.path}: ${problem.message}`).join('; '));
}
const restored = result.configuration; // typed ReconciliationConfiguration
```

### Saving generated configuration snapshots

Generation remains storage-free by default. To generate and synchronously save a
new JSON snapshot, explicitly supply a destination directory:

```ts
const { configuration, filePath } = generateReconciliationConfiguration(catalogue, {
  save: { directory: './out/configuration-history' }
});
// filePath is the absolute path of the new JSON file.
// Pass configuration to enabled aggregate(), or review/edit the saved file first.
```

The directory is created recursively if needed; relative paths resolve against
the current working directory. Every save creates a new filename such as
`reconciliation-configuration-2026-11-18T15-31-37-711Z-<uuid>.json`.
The UTC timestamp is filename-safe and the UUID distinguishes saves within the
same millisecond. Exclusive creation prevents overwriting even if a name collides.
Invalid directories and filesystem failures throw; there is no unsaved-success
fallback. The one-argument call still returns just `ReconciliationConfiguration`;
the save-enabled overload returns `{ configuration, filePath }`.

The JSON contains only configuration, not file metadata, so it remains valid
input to `validateReconciliationConfiguration`. Its `version: 1` is the schema
version, not a save counter. These are snapshots of newly generated defaults:
they do not automatically save edited preferences, migrate older configurations,
choose an active/latest file or enable runtime reconciliation. The application
still owns those decisions. Validation, updates and `aggregate()` never write files.

Only keys declared by at least two registered sources receive entries. Defaults
list supporting sources in registration order, with the first source preferred
and `missingData: 'strict'`. Strict preference means using only that first source;
`fallback` permits trying the remaining listed sources in order when earlier
sources have no eligible value. Generation itself does not execute selection;
pass the configuration to enabled `aggregate()` to apply it.

Users may reorder or remove sources, but each priority list must remain nonempty
and contain no duplicates. Every listed source must declare that particular key.
Every shared key requires an entry; unknown keys and single-source keys are
errors. Unsupported versions, malformed fields, unknown fields, and invalid modes
are errors too. Validation accepts `unknown`, returns either
`{ ok: true, configuration }` or `{ ok: false, problems }`, and never mutates
input, supplies missing defaults, or silently rewrites preferences. A successful
result is an independent copy. JSON round trips preserve priorities and modes.
JSON parsing checks syntax only; validation checks the configuration structure
and compatibility with the catalogue before returning a typed configuration.

Validation alone never appends supporting sources. To update saved preferences
after registrations change, use the explicit update operation below.

These are user preferences, not reliability grades or evidence of clinical validity.

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

`src/verification/exampleBundle.ts` emits both basic bundling and an explicitly
configured two-source bundle with one selected measurement and one abstention.
A third fixture exercises contained subjects and transitive contained-device
references; a fourth checks rebased relative metadata and preserved local offsets.
All run through the HL7 validator in CI (`pnpm emit-bundles out/`).

## Migration from always-on reconciliation

- Calls with only `sources`, `subjectKey` and `timestamp` now bundle without
  reconciliation. Supply explicit enablement, catalogue and saved configuration.
- Catalogue registration order seeds newly generated preferences only; runtime
  bundle order never changes saved priorities. Runtime never generates preferences.
- Decisions identify `key` and `window`, replacing legacy `measure` and `day`.
  Outcomes, attempts and diagnostic codes explain selection, fallback and abstention.
- Exact windows replace legacy calendar-day grouping. Date-only or incomplete
  summaries may now yield diagnostics rather than a selection.
- Source addresses are preserved rather than canonicalized again. Every considered
  Observation needs a `fullUrl` when producing derived provenance.
- Legacy `selectSource`, `measureOf`, `effectiveDay`, `occasionKey` and core reliability
  exports remain temporarily available for compatibility, but `aggregate()` does not
  use them. Their removal is tracked separately in #279; do not use them as fallback.
