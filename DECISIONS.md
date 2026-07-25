# Decisions

Cross-cutting choices that every connector must follow. Each was previously answered
several different ways inside the same repository, which is why the same measurement
could arrive under one code with two different units depending on which connector
produced it.

Recorded here rather than in a pull request description so that the next person can
see what was decided and why, and argue with it.

---

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

## D6 — Partial failure

**Decision.** Absence of data is never an exception. Fan-out uses
`Promise.allSettled`. Public entry points return `{ bundle, issues }` where `issues`
is a FHIR `OperationOutcome`.

**Why.** Ten mappers threw on empty data while two returned `[]`, and every fan-out
used `Promise.all`, so one rejection discarded every sibling result. A caller had no
way to distinguish "no data in this window" from "rate-limited" from "library bug".
`OperationOutcome` is the FHIR-native way to say four types succeeded and one did not.

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

## D8 — The connectors stay stateless

**Decision.** The packages remain libraries. State that syncing requires — token
persistence, cursors, de-duplication — is expressed as `TokenStore` and `CursorStore`
interfaces that the host implements.

**Why.** Every capability the connectors still lack requires state, and a pure mapping
library has none. Keeping the state outside is also the honest reading of the
project's own premise that data stays where it is generated.

**Trade-off.** The host carries real responsibility and the connectors stop being
drop-in.

## D9 — Package names and versions

**Decision.** Packages are scoped `@open-twin/*` and versioned from `0.1.0`.

**Why.** All three previously sat at `1.0.0` — a semver promise about an API that this
remediation breaks repeatedly — under unscoped names that are squattable, while the
README instructed users to install `@open-twin/provider-fitbit`. Doing the rename and
the version drop first means the remediation executes as pre-1.0 iteration rather than
as a series of breaking changes to a released 1.0.

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
