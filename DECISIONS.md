# Decisions

Cross-cutting choices that every connector must follow. Each was previously answered
several different ways inside the same repository, which is why the same measurement
could arrive under one code with two different units depending on which connector
produced it.

Recorded here rather than in a pull request description so that the next person can
see what was decided and why, and argue with it.

---

<a id="d1"></a>

## D1 — Subject linkage

**Decision.** Public entry points accept an optional `subject: Reference`. When the
caller supplies one it is used verbatim. When they do not, the connector emits a
deterministic `urn:uuid:` reference derived from the vendor's own user id, and a
matching `Patient` resource as an entry of the bundle with a `fullUrl`.

**Why.** Four conventions were in use simultaneously: `Patient/${person.id}`,
`Patient/example` (ten Oura mappers, all of Google Health, all of VITRONIC),
`Patient/unknown`, and `Scan/${scan_id}` — where `Scan` is not a FHIR resource type.
A single bundle for a single person therefore pointed at several patients that do not
exist, and on ingestion every Observation became silently attributable to whatever
`Patient/example` happened to exist on the receiving server.

**Trade-off.** A caller-supplied reference is the honest option: the connector
genuinely does not know who the patient is. It does push work to the integrator, who
does. The `urn:uuid:` fallback keeps a bundle internally consistent without asserting
an identity the connector cannot vouch for.

Implemented by `subjectReference` in `@open-twin/fhir-core`.

<a id="d2"></a>

## D2 — Identifier and id strategy

**Decision.** `Observation.id` is `uuidv5(connector | vendor user id | vendor record
id | measure)`. `Identifier.system` is a Foundation-controlled namespace (D3).
Bundles may be emitted as `transaction` with `PUT Observation/<id>` for callers who
want server-side upsert.

**Why.** `Observation.id` was never set on any resource in any package, and only two
of roughly forty mappers set an identifier at all. Every re-sync of the same window
created duplicate resources. Neither incremental sync nor deletion is implementable
without a stable address for a resource.

**Note.** Ids must be UUIDs, not human-readable strings. `Bundle.entry.fullUrl` uses
`urn:uuid:`, and the HL7 validator reports a non-UUID there as an **error**. This was
found by running the validator, not by reading the specification.

**Trade-off.** `transaction` commits the caller to a server that performs upsert and
makes the bundle non-inert. `collection` plus a stable identifier leaves
de-duplication to the receiver. Both are supported; `collection` is the default.

<a id="d3"></a>

## D3 — Code system URIs for vendor concepts

**Decision.** One Foundation-controlled namespace per connector:

```
http://opentwin.ch/fhir/CodeSystem/oura
http://opentwin.ch/fhir/CodeSystem/google-health
http://opentwin.ch/fhir/CodeSystem/vitronic
```

Each will be backed by a real `CodeSystem` resource in the implementation guide.

**Why.** The previous arrangement was worse than ad hoc. `OURA_CUSTOM` was set to
`https://cloud.ouraring.com/v2/docs` — a vendor documentation page — and mappers
appended **URL fragments** to it (`#tag/Sleep-Routes`, `#tag/Daily-Activity-Routes`,
`#tag/Personal-Info-Routes`) to manufacture distinct systems. One connector therefore
claimed at least four code systems, distinguished by anchors in someone else's web
page, none controlled by the Foundation and none defined by any resource.

A code system URI you do not control is not a code system.

**Outstanding.** The HL7 validator currently warns that these CodeSystems cannot be
resolved. That warning is correct and stays until the IG publishes them. Publishing
the IG is tracked as connector-completion work, not as a defect.

<a id="d4"></a>

## D4 — One unit per concept

**Decision.** `LOINC_UNITS` in `@open-twin/fhir-core` binds each LOINC code to
exactly one `(unit, UCUM code)` pair. Every connector imports it. Canonically:
durations in `min`, body height in `cm`, body weight in `kg`, VO₂max in `mL/kg/min`,
heart and respiratory rate in `/min`, oxygen saturation in `%`.

**Why.** The same concept was emitted with different units by different connectors:
LOINC 93832-4 as unitless seconds by Oura and as `min` by Google Health; body height
as `m` by Oura, `mm` by Google Health and a local code by VITRONIC. Merging two
bundles for one person produced contradictory numbers under an identical code —
destroying exactly the cross-connector comparability this project exists to provide.

Where the FHIR R4 vital-signs profiles **fix** a unit, the profile wins over LOINC's
example unit. `{beats}/min` and `{steps}` are absent from `ucum-vitals-common`, so a
vital-signs Observation carrying either is a conformance failure.

**Trade-off.** A shared workspace package and a build-order dependency, rather than a
lint rule that would be cheaper and weaker.

<a id="d5"></a>

## D5 — Dispatch on the requested type, not on the response shape

**Decision.** Response parsing selects a schema by the type that was requested.
Structural sniffing of `data[0]` is removed.

**Why.** `bundleBuilder` already knew the type — it iterates `request.types[i]` — and
then called `inferOuraResponse`, which discarded that knowledge and guessed again by
probing `data[0]` for a marker field. Seven of thirteen types were discriminated on
fields the schema marks **optional**, so a perfectly valid response that happened to
omit one optional field was classified `unknown` and the whole bundle was discarded.

The known instance was `workout`, discriminated on `workout_type`, a field that does
not exist (it is `activity`). Patching that one field would have left the bug class
intact: `daily_readiness`, keyed on `temperature_trend_deviation`, is next.

**Trade-off.** A public API change, which is one of the reasons for D9.

<a id="d6"></a>

## D6 — Partial failure

**Decision.** Absence of data is never an exception. Fan-out uses
`Promise.allSettled`. Public entry points return `{ bundle, issues }` where `issues`
is a FHIR `OperationOutcome`.

**Why.** Ten mappers threw on empty data while two returned `[]`, and every fan-out
used `Promise.all`, so one rejection discarded every sibling result. A caller had no
way to distinguish "no data in this window" from "rate-limited" from "library bug".
`OperationOutcome` is the FHIR-native way to say four types succeeded and one did not.

<a id="d7"></a>

## D7 — Time and timezone

**Decision.** `effective[x]` carries the subject's local UTC offset as supplied by the
vendor. Query windows are half-open `[start, end)` and computed **once** per sync.
Civil-date filters derive from the subject's local date, never from a UTC instant.

**Why.** `new Date(timestamp).toISOString()` discarded the offset Oura supplies,
shifting daily summaries to the previous day for any wearer east of UTC. Google
Health's `toCivilDate` sliced the first ten characters off a UTC ISO string, and
recomputed `end` inside the per-type loop, so a single sync had a different end
boundary for each data type. VITRONIC carried no time at all, although
`Viatar.meta.crtime` was available and already being fetched.

<a id="d8"></a>

## D8 — The connectors stay stateless

**Decision.** The packages remain libraries. State that syncing requires — token
persistence, cursors, de-duplication — is expressed as `TokenStore` and `CursorStore`
interfaces that the host implements.

**Why.** Every capability the connectors still lack requires state, and a pure mapping
library has none. Keeping the state outside is also the honest reading of the
project's own premise that data stays where it is generated.

**Trade-off.** The host carries real responsibility and the connectors stop being
drop-in.

<a id="d9"></a>

## D9 — Package names and versions

**Decision.** Packages are scoped `@open-twin/*` and versioned from `0.1.0`.

**Why.** All three previously sat at `1.0.0` — a semver promise about an API that this
remediation breaks repeatedly — under unscoped names that are squattable, while the
README instructed users to install `@open-twin/provider-fitbit`. Doing the rename and
the version drop first means the remediation executes as pre-1.0 iteration rather than
as a series of breaking changes to a released 1.0.

<a id="d10"></a>

## D10 — VITRONIC angles are converted to degrees

**Decision.** `angle.ts` and `axes.ts` convert radians to degrees and emit UCUM `deg`.
`marker.ts` emits UCUM `1`.

**Why.** The API returns radians — proven from the committed snapshot, where
`primary + supplementary` is exactly π to the last bit of float64 and `conjugate` is
exactly `2π − primary`, and separately for `axes.ts` by reproducing the rotation
triple as `atan2` of the axis direction components. Emitting those values under `deg`
understates every angle by a factor of 57.3: an 84.9° joint angle publishes as 1.48.

Both fixes are UCUM-valid — convert and use `deg`, or keep the value and use `rad`.
`deg` is chosen because the consumer is clinical.

**`marker.ts` is not an angle at all.** `marker.normal` sits beside `marker.position`
and is a surface normal: three components of one direction vector, dimensionless
direction cosines in [−1, 1]. There is no π relationship anywhere in the marker data.
Converting those values from radians to degrees would multiply a dimensionless number
by 57.3 and make the output worse than it is today; emitting `rad` would be equally
wrong. They are UCUM `1`.

---

<a id="d11"></a>

## D11 — Anchor LOINC property / unit mismatches (pending)

**Status.** Proposed — human decision required.

**Context.** Three Anchor-core markers bind molar LOINC FSNs to mass source units:

| biomarker_id | name_de   | LOINC                                                  | unit_source |
| ------------ | --------- | ------------------------------------------------------ | ----------- |
| BM-060       | Bor       | 52914-9 Boron [Moles/volume] in Serum or Plasma        | µg/l        |
| BM-186       | Kupfer    | 14665-4 Copper [Moles/volume] in Serum or Plasma       | µg/l        |
| BM-405       | Vitamin K | 58793-1 Phytonadione [Moles/volume] in Serum or Plasma | ng/l        |

`scripts/compile-anchor-layer.ts` detects exactly these three (D-e) and exits
non-zero. It does **not** auto-fix.

**Decision.** Pending. A human must choose, for each marker, whether to:

1. Keep the molar LOINC and convert / restate the unit as molar, or
2. Replace the LOINC with a `[Mass/volume]` code that matches the mass unit, or
3. Split into two observations (molar vs mass) with explicit provenance.

**How the artefact is produced today (despite exit 1).** There is **no**
compile override flag. The compiler always writes
`packages/anchor-layer/data/anchor-layer.v1.json` and its `.sha256` companion
**before** exiting non-zero on D-e. Consumers and package tests read that
**committed** JSON. Regenerating it is
`pnpm --filter @open-twin/anchor-layer compile` (or
`tsx scripts/compile-anchor-layer.ts`), which refreshes the files and then fails
closed so CI cannot green-wash the mismatch.

**CI before Martin decides.** Package `build` is `tsup` of the loader only — it
does **not** run the compiler and does **not** require exit 0 from D-e. Package
`test` _does_ invoke the compiler and asserts exit 1 plus the three mismatch IDs
(and a meta-test that module-resolution failure does not satisfy that assertion).
So CI stays green on `build`/`test` while `compile` remains intentionally red
until D11 is accepted. The published artefact on the branch is the committed
JSON, not a successful compile.

**Consequences.** Terminology review-records for these three codes stay blocked
on this decision. No silent rewrite of `unit_ucum` or `loinc_code` in the
compiler. No `(low, high)` on Biomarker; ReferenceInterval stays first-class.

<a id="d12"></a>

## D12 — Interpretation region key is openXR SystemId

**Decision.** The interpretation document addresses anatomy for visualisation with
the field `system_id`, whose value set is **exactly** the nine `SystemId` values
owned by open-twin-openXR (`openXR#D8` — that repo renders anatomy and does not
interpret health data; scoring and code→system assignment stay upstream):

`musculoskeletal | cardiovascular | nervous | respiratory | metabolic |
digestive | endocrine | integumentary | reproductive`

This repository **consumes** that enum. It does not extend it, rename values, or
add a tenth. Markers with no home (CBC block, immunoglobulins, Kreatinin,
Harnsäure, hsCRP — 14 of 67) are emitted under top-level `unrenderable[]` with an
explicit reason, never dropped and never rerouted to a neighbour.

Interpretive anatomy is assigned only from the curated organ mapping in the
Anchor workbook. The LOINC System axis is a specimen, not a pathology site.
Severity is ordinal (`none | borderline | mild | moderate | marked |
indeterminate`). Confidence is rule-support
(`completeness × recency × rule_strength`), not disease probability.

**Why.** Shipping FHIR reference-range flags alone is not an interpretation
layer: the XR viewer would not know which system moved. A single risk score
destroys which-system-moved signal and invites MDR-shaped recommendation misuse.
A parallel 25-value region enum was withdrawn — openXR geometry keys `SystemId`
only (`openXR#D8`), so a parallel enum is unrenderable there.

**Consequences.** Conformance rejects unknown `system_id` values and any
reroute of `unrenderable[]` into `states[]`. Types are generated from the JSON
Schema; open-twin-openXR consumes `@open-twin/interpretation-contract` and does
not re-declare the enum.

<a id="d13"></a>

## D13 — MDR intended-use line on every interpretation document

**Context.** Interpretations support research hypothesis generation. The
[intended-use guidance](docs/INTENDED-USE.md) defines the medical-use exclusion
and EU product boundary; schema constants do not establish regulatory status.

**Decision.** Every interpretation document **must** carry:

| Field                    | Value                                   |
| ------------------------ | --------------------------------------- |
| `intended_use`           | `research_hypothesis_generation_n_of_1` |
| `not_for_diagnostic_use` | `true`                                  |

These are schema constants. Any other value is non-conformant. A recommendation
engine — if built — requires a separate intended-purpose decision and appropriate
regulatory assessment. A component boundary does not itself exempt the combined
product. Recommendations remain outside this document's scope.

**Consequences.** Conformance rejects documents that omit or alter these fields.
XR and research UIs must explain the research scope alongside interpretation
outputs, including that confidence measures rule support, not disease probability.
They must not offer “diagnose” or “treat” affordances fed by this document. Changing
intended use requires a new decision, contract version and product assessment.

---

<a id="d14"></a>

## D14 — Four-layer model and interface ownership

**Decision.** OpenTwin is four layers. Each layer owns one interface and must not
reach into another layer’s vocabulary to do that layer’s job:

| Layer              | Owns                                                  | Must not                                            |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| **Terminology**    | Code systems, UCUM, allowlists, review records        | Invent codes; publish SNOMED in artefacts           |
| **Ingestion**      | Connectors and shared FHIR builders → R4 Bundles      | Score, interpret, or assign anatomy systems         |
| **Interpretation** | Anchor artefact, rules, interpretation document       | Emit recommendations; extend `SystemId`             |
| **Geometry / XR**  | Anatomy, materials, XR rendering (`open-twin-openXR`) | Score, map terminology, or invent `SystemId` values |

Cross-repo: visualisation consumes an already-shaped interpretation /
`HealthTwinData` surface. Scoring and code→system assignment are **out of scope**
in openXR per `openXR#D8` and belong here (ingestion + interpretation). This
repository’s open-twin `D8` (connectors stay libraries) is a different decision —
never write bare `D8` when the other repo’s scope decision is meant.

**Why.** ADR stubs never recorded this; the layer split was assumed in prompts and
package layout. Without a numbered decision, “fix it in the viewer” and “add a
tenth SystemId” keep recurring. Interface ownership is what makes stacked
branches reviewable: a headers branch does not land Anchor URIs; a connector
branch does not redefine `SystemId`.

**Consequences.** Headers’ `GOVERNED BY` points at the decision or contract for
the layer the module implements. New packages declare a layer in their README.
Crossing a layer boundary requires an explicit decision, not a convenience import.

<a id="d15"></a>

## D15 — VITRONIC property paths have SI units by exact path

**Decision.** BodyLoop 0.13.7 `properties[].property_path` values that match these
strings exactly carry the SI unit in the table. Any other path stays a Quantity
with a value and no unit. Matching is exact: `body.mass` is not `body.mass_index`.

| `property_path` | UCUM    |
| --------------- | ------- |
| `body.height`   | `m`     |
| `body.surface`  | `m2`    |
| `body.volume`   | `m3`    |
| `body.mass`     | `kg`    |
| `body.bmi`      | `kg/m2` |

`body.bmi` is the scanner-reported figure. It is not recomputed from mass and
height — those do not agree on this device.

**Why.** D4 binds LOINC codes, and these Observations use the vendor-local
Vitronic CodeSystem. D10 is the measure-list decision (metres; angles converted
from radians to degrees) and must not be stretched to untyped property keys.
The payload does not name a unit on the property; the five paths were established
from the live 0.13.7 API. A missing unit on an unknown path is recoverable; a
wrong unit (the original issue’s litres for volume) is silently interpretable.

**Trade-off.** Unknown numeric properties remain incomplete Quantities, still
covered by the units-allowlist waiver on the mapper file. Extending the table
is a D15 amendment, not a local guess.

<a id="d16"></a>

## D16 — Reader interface and registry

**Decision.** Every ingestion package exposes its connector through one interface,
`IHealthDataReader` in `@open-twin/reader-core`, by extending `HealthDataReader`.
Static facts about a reader live in its `descriptor`, which must equal its entry in
the registry (`registry/connectors.json`, the single source of truth for what exists).
The delegating reader is the only place that chooses a reader for an input. State
lives in host-implemented `TokenStore` and `CursorStore` (restating D8): the library
defines the interfaces and never a store. `reader-core` depends on `fhir-core` only;
the FHIR validation in its conformance suite is injected by the adapter package, so
`fhir-r4` can itself be a reader without a dependency cycle.

**Why.** The connectors are nine libraries with nine entry-point signatures. A
consumer (twin-llm today) calls each one directly, pins a commit and never reaches
`aggregate`. Bio-Formats showed what one reader interface, a registry and a delegator
buy: a tool that reads any format it has a reader for, and a conformance suite that
makes every reader pay the same price. The spec is `docs/specs/reader-architecture.md`
(#229).

**Trade-off.** One more package in the build, and during phase 1 the adapters double
the public surface: the existing entry points stay until phase 3 retires them with a
decision entry of their own.

<a id="d18"></a>

## D18 — Measurement keys, connector declarations and the catalogue

**Decision.** A measured concept has one key. `@open-twin/fhir-core` owns the
declaration schema and the **shared definitions** (`MEASUREMENT_DEFINITIONS`): concepts
more than one connector can emit, each with a meaning, a value type, a canonical UCUM
unit and a context (scope and, for a summary, statistic). A concept only one vendor
has gets a **connector-owned** key, `<connector>:<name>`, defined in that connector's
package; no connector may declare or define another's namespace. Every connector
exports a versioned `MeasurementDeclarationSet` beside its mappers saying, for each
Observation and component it emits, which key it is, the coding that identifies it,
where the value sits (the Observation, or the component under a parent coding — never
an array position), and the emitted value type and unit. `@open-twin/aggregate` builds
a catalogue from the sets the caller registers, grouped by key, without credentials,
network or bundles.

Rules that make the identity hold:

- A declaration's type, unit and context must equal its definition's. A
  commensurable unit is still a mismatch; declaring a unit converts nothing.
- Each emitted value must match exactly one declaration. Where two distinct
  measurements share a standard code (a daily mean and a sleep mean under one LOINC
  code), the mapper adds a vendor-local coding to tell them apart; the standard code
  stays.
- A connector test builds bundles through the real mappers and requires
  `auditMeasurementDeclarations` to report no undeclared, ambiguous, mistyped or
  mis-unit value, no value dropped without a `dataAbsentReason`, and no unexercised
  declaration. Packages that forward codes chosen
  by their input (`fhir-r4`, `hl7v2`) declare `coverage: 'open'` and only what they
  mint themselves.
- Definitions carry no source preference and no reliability grade. The catalogue
  records capability, not data availability; it ranks nothing.

**Why.** Matching lived in a hardcoded table inside aggregate (`measure.ts`) that
merged distinct concepts — 103213-5 "Duration in bed" with 93832-4 "Sleep duration",
REM/light/deep into one `sleep-staging`, 103222-6 "Heart rate.minimum" with resting
heart rate, and Oura's 0–100 `hrv-balance` contributor with an HRV in milliseconds.
Connectors exported nothing a consumer could inspect before fetching, so which sources
overlapped could only be discovered from data, and only for the window fetched. The
WHOOP connector emitted recovery resting heart rate and cycle average heart rate under
the same bare LOINC code at the same location, which no declaration could separate.

**Trade-off.** Every new mapper field needs a declaration, and the audit test fails
until it has one. That is the point: an undeclared value is a value no consumer can
identify without reading the mapper. Enabled `aggregate()` now uses the catalogue
and user-owned preferences (D20), not the legacy table or reliability grades. The declaration-driven runtime
API `resolveReadings` checks values against an explicit key, context, subject reference
and time window without selecting a source. Time compatibility requires identical
complete instants or period boundaries (timezone-normalized, retaining fractional
seconds); summaries require complete periods. Date-only markers, open periods and
overlap alone cannot establish comparability. This is intentionally conservative:
there is no inferred day boundary, patient matching, unit conversion or time tolerance.
Until declarations can express nested units, ranges, ratios and sampled-data origins
carrying any unit metadata are ineligible; unitless complex values remain supported.

<a id="d19"></a>

## D19 — User-owned source preference configuration

**Decision.** Aggregate generates a version-1 JSON configuration from the measurement
catalogue, with one `measurements` entry for every key declared by at least two
registered sources. Each entry has a nonempty `sourcePriority` list, initially in
connector registration order, and a `missingData` mode, initially `strict`.
`strict` means only the first source is preferred; `fallback` permits trying the
listed sources in order when preceding sources have no eligible value. These are
user preferences, not reliability grades or claims of clinical validity.

The application may reorder or remove sources, choose either mode per key, and
owns editing and the choice of persistence. Generation is storage-free by default.
An explicit `save: { directory }` option synchronously creates a new JSON snapshot
and returns `{ configuration, filePath }`, with an absolute path. Its filename
contains a UTC timestamp and UUID, and exclusive creation never overwrites an
existing file. The directory is created recursively; invalid paths and I/O errors
fail explicitly. Snapshots contain only configuration; timestamps do not change
the schema version or establish which configuration is active. Saving fresh
defaults does not snapshot user edits or migrate preferences automatically.
Validation accepts `ReconciliationConfiguration`
and retains defensive runtime checks for JSON-loaded data. It requires
every currently shared key, rejects unknown and non-shared keys, and checks that
each listed source declares that key. Sources need not all be listed, but may not
repeat. Unknown fields and unsupported versions are errors, never silently
discarded or upgraded. Validation neither changes input nor supplies defaults.
Validation never appends supporting sources. Catalogue changes that invalidate a
saved configuration require explicit action by the application.

The explicit `updateReconciliationConfiguration` operation takes saved preferences
and complete previous/next catalogue snapshots. The previous snapshot must be
persisted with the preferences: version numbers alone cannot reconstruct changed
definitions or distinguish user exclusions from newly available sources. The
baseline configuration must validate before an update can be proposed.

Updates preserve priorities, exclusions and modes, append only genuinely new
supporting sources in next registration order, and default newly shared keys to
strict. New unique keys get no entry. The result contains an independent proposal,
a change report, conflicts requiring explicit resolution, and validation problems.
Removed configured measurements, shared-to-unique transitions and removed listed
sources block the proposal without dropping preferences or promoting a source.
Removed excluded sources and unique measurements are reported without blocking.
Every removed supporting source is reported per key, even if the whole key is gone.

Definition changes, including description edits, and changes to an existing
source/key's declaration set conservatively require review, including for unique
keys and excluded sources. Compare actual content, not version numbers, ignoring
declaration/property order. Catalogue schema changes block interpretation; version
bumps alone do not make unchanged definitions/declarations incompatible.
Callers must explicitly resolve structural conflicts and validate the edited
proposal, and separately review/accept or migrate semantic conflicts. Structural
validation cannot establish semantic compatibility. No API auto-accepts conflicts.
An invalid baseline returns no proposal; other blocked updates retain one for
review and editing. Neither the old inputs nor stored preferences are mutated.

**Scope.** Generation, validation and updates require no credentials, network or
bundles. Only explicit save-enabled generation writes files; validation and updates
never persist anything. Enabled runtime reconciliation consumes the supplied
configuration (D20) and never silently updates it.

**Why.** Consumers must be able to prepare and save preferences before fetching
data, and distinguish an invalid saved configuration from absent measurements.
Requiring every shared key makes missing preferences explicit, while allowing
source subsets lets the user exclude a source rather than having it silently
restored.

<a id="d20"></a>

## D20 — Basic bundling and explicitly configured reconciliation

**Decision.** `aggregate()` bundles without source selection by default.
`reconciliation: { enabled: true, catalogue, configuration }` opts into selection.
Both catalogue and configuration are required; invalid configuration fails explicitly,
even for empty bundles. Runtime never generates, updates or persists preferences,
and never falls back to reliability grades or legacy measurement/day mappings.
The legacy public helpers remain pending their separate removal under #279.

Both paths preserve source resource ids, fullUrls and reference relationships without
mutating inputs. Identical resources at an address and meta.versionId are coalesced,
including within one connector's selection inventory; conflicting content for that
same identity fails explicitly. Distinct versions retain their original unversioned
fullUrls (FHIR R4 bdl-7). Derived lineage uses RESTful version-specific references
when available. Multiple versions at an opaque address, or a versionless entry
sharing an address with other versions, cannot establish unambiguous derived
lineage and fail explicitly if considered in a successful selection; basic bundling
still carries them.
The output is a collection, not an execution of source transaction/search instructions.
Every source entry must have a nonempty fullUrl, as required for collection entry
identity in FHIR R4. Both paths reject missing addresses, including id-less transaction
POSTs, rather than inventing identities from resource ids. An addressed id-less
resource retains its missing id.
Existing nonempty-source, connector-attribution and single-subject guards remain.
No patient identity is inferred.
Subject comparisons resolve relative references against the containing entry's
RESTful fullUrl. Equal relative ids on different servers or service roots are not
equal subjects. Both paths reject a relative subject without a RESTful resolution
base; callers must instead supply a shared absolute or URN identity.

Enabled reconciliation automatically discovers occasions for catalogue-shared keys
using declaration identity, exact subject reference, context and complete normalized
time windows. It reuses explicit reading resolution's eligibility and time rules,
preserving sub-millisecond precision. Matching dates or overlapping periods alone
are insufficient. Daily/session/sleep summaries require complete periods.
An instant-only summary produces an invalid-time discovery diagnostic and no occasion;
complete instants remain valid for reading and record scopes.
Missing values can establish an occasion; missing subjects or invalid/incomplete
effective times cannot and produce positional diagnostics. Completely absent
data produces no invented occasions. Results distinguish disabled reconciliation,
no discoverable occasions, and completed decisions. Unique and undeclared values
are carried without source selection.

Strict inspects only the first saved source. Fallback inspects listed sources in
saved order, moving past sources with no eligible reading. Multiple eligible
readings or ambiguous declarations at an inspected source cause abstention, never
arbitrary choice or fallback past ambiguity. Excluded sources remain excluded.
Catalogue-shared keys retain their configured policy when only one source returns
data. Structured outcomes and attempts describe preference, not clinical superiority.
Diagnostics and errors contain no health payloads.
Focused readings are ineligible with unsupported-focus because declarations and
requests cannot compare measurement targets other than the subject. Root or
selected-component modifier extensions are ineligible with
unsupported-modifier-extension because their semantics are not understood.
Both checks also apply to explicit reading assessment. Originals remain intact;
strict abstains and fallback may continue to an eligible unqualified reading.

Successful selection adds one measurement-level Observation, with a component's own
coding/value/interpretation/reference range when applicable, not a cloned panel.
Every considered Observation must have a fullUrl for provenance; absent addresses
fail explicitly rather than generating unresolved references. Derived lineage
includes distinct original Observations considered, not just the winner. Derived
identity includes the occasion, source references and selected source; input order
does not change decisions or derived identity. Original resources remain intact.
Normalized windows are comparison/reporting/identity keys only: the derived
effective[x] preserves the winner's original type, local offset, precision and
period metadata (D7). Copied relative references are rebased to their original
absolute targets, including in retained contained resources; an unknown resolution
base is an explicit validation error rather than a guessed link.
Retained fragment references carry their required contained-resource graph, including
transitive targets, but not unrelated panel-only resources. A contained target's
back-reference to its original container is rebased to the original Observation's
fullUrl, not silently redirected to the derived assertion. Missing or ambiguous
targets fail explicitly. Fragment subjects are scoped to their containing resource;
the same fragment label in different Observations cannot establish patient identity.

**Why.** Bundling must not imply a source-selection decision. Configuration describes
supported capabilities and user intent independently of current data availability.
Automatic discovery provides batch reconciliation without requiring callers to
enumerate windows, but cannot safely invent comparability from partial timing.

<a id="d21"></a>

## D21 — Measurement keys outside Anchor get a SystemId in the interpretation layer

**Decision.** `@open-twin/interpretation-contract` owns `MEASUREMENT_SYSTEMS`: the
`SystemId` each scan and wearable catalogue key (D18) lights, and
`UNRENDERABLE_MEASUREMENTS`, the keys deliberately kept off the body with a D12
`reason`. Anchor lab markers are not in it; they keep the `system_id` the Anchor
artefact assigns (D12). Every row is `review: 'pending'` until a named clinical
reviewer signs it off. A component key resolves through its parent.

The rows follow the Anchor organ-to-system contract where a region fits (body
composition, bone and muscle → musculoskeletal; sleep → nervous) and TwinLLM's
vitals table otherwise (heart rate → cardiovascular; HRV → nervous, as autonomic
regulation; SpO2 and respiratory rate → respiratory; steps → musculoskeletal).
Composite scores, VO2max, body temperature and energy expenditure are
`not_anatomical`.

**Why.** D12 assigns anatomy only from the Anchor mapping, which has no row for a
wearable or a scan measurement, and D14 forbids the ingestion layer, where the
catalogue lives, from assigning systems. Without a table here, the twin either lit
nothing for scan and wearable data or each consumer invented its own mapping.

**Trade-off.** The table is a research assignment, not a reviewed one. A consumer
must show the pending status rather than present a row as clinically established.

## Still open — needs a named clinical reviewer

These cannot be settled by research, and they are the root cause of the terminology
defects rather than a consequence of them. The reviewer should be recruited now, in
parallel with the code work, not after it.

- **LOINC 103213-5 "Duration in bed"** is a genuine LOINC modelling anomaly, verified
  against two independent sources: the component says _duration_, the property is
  `NRat` and the example unit is `/h`. Those cannot both be right. `/h` is
  dimensionally meaningless for a duration, so `min` is emitted pending a term-change
  request to Regenstrief. A reviewer must confirm or overrule that.
- **LOINC 2339-0 vs 15074-8 (glucose).** 2339-0 is _mass_ concentration (mg/dL);
  15074-8 is substance concentration (mmol/L). Both have `UNITSREQUIRED = Y`. Sending
  mmol/L under 2339-0 is the same class of property mismatch as the VO₂max defect.
  Nobody has recorded which one Google Health actually sends.
- **LOINC 11524-6 "EKG study"** has scale `Doc` — it is a _document_ code. If it is on
  an Observation carrying a number, it is wrong.
- **Sleep efficiency, vascular age and temperature deviation** have no standard
  concept in either LOINC or SNOMED CT. Verified twice, including an exhaustive
  expansion of the eight descendants of SNOMED `363817001 |Sleep related observable|`.
  They use vendor-local codes and need sign-off that this is acceptable.

One correction worth recording, because it shows the failure mode: the first research
pass concluded that **no LOINC code exists for a minimum heart rate** and recommended
a vendor-local code for Oura's `lowest_heart_rate`. That was wrong. LOINC 2.82 has at
least four, including **103222-6 "Heart rate.minimum"** whose example unit `/min` also
satisfies the vital-signs binding. Abandoning a standard code that exists is the more
damaging of the two possible errors, so every "no code exists" claim in this file was
re-run against a second independent source before being written down.
