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

| biomarker_id | name_de | LOINC | unit_source |
|---|---|---|---|
| BM-060 | Bor | 52914-9 Boron [Moles/volume] in Serum or Plasma | µg/l |
| BM-186 | Kupfer | 14665-4 Copper [Moles/volume] in Serum or Plasma | µg/l |
| BM-405 | Vitamin K | 58793-1 Phytonadione [Moles/volume] in Serum or Plasma | ng/l |

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
`test` *does* invoke the compiler and asserts exit 1 plus the three mismatch IDs
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

**Context.** The project's intended use is research and non-medical consumer
wellness; experimental interpretation remains research-only. Medical-device
qualification depends on intended purpose, functionality and product claims.
MDR Annex VIII Rule 11 classifies relevant software after qualification; it is
not an exemption for software without a recommendation field. Laboratory or
genetic interpretation may also require an IVDR assessment. A research label or
schema constant does not settle either question. See
[Intended use and integration responsibilities](docs/INTENDED-USE.md).

**Decision.** Every interpretation document **must** carry:

| Field | Value |
|---|---|
| `intended_use` | `research_hypothesis_generation_n_of_1` |
| `not_for_diagnostic_use` | `true` |

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

| Layer | Owns | Must not |
|---|---|---|
| **Terminology** | Code systems, UCUM, allowlists, review records | Invent codes; publish SNOMED in artefacts |
| **Ingestion** | Connectors and shared FHIR builders → R4 Bundles | Score, interpret, or assign anatomy systems |
| **Interpretation** | Anchor artefact, rules, interpretation document | Emit recommendations; extend `SystemId` |
| **Geometry / XR** | Anatomy, materials, XR rendering (`open-twin-openXR`) | Score, map terminology, or invent `SystemId` values |

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


## Still open — needs a named clinical reviewer

These cannot be settled by research, and they are the root cause of the terminology
defects rather than a consequence of them. The reviewer should be recruited now, in
parallel with the code work, not after it.

- **LOINC 103213-5 "Duration in bed"** is a genuine LOINC modelling anomaly, verified
  against two independent sources: the component says *duration*, the property is
  `NRat` and the example unit is `/h`. Those cannot both be right. `/h` is
  dimensionally meaningless for a duration, so `min` is emitted pending a term-change
  request to Regenstrief. A reviewer must confirm or overrule that.
- **LOINC 2339-0 vs 15074-8 (glucose).** 2339-0 is *mass* concentration (mg/dL);
  15074-8 is substance concentration (mmol/L). Both have `UNITSREQUIRED = Y`. Sending
  mmol/L under 2339-0 is the same class of property mismatch as the VO₂max defect.
  Nobody has recorded which one Google Health actually sends.
- **LOINC 11524-6 "EKG study"** has scale `Doc` — it is a *document* code. If it is on
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
