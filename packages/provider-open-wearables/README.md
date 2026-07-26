# @open-twin/open-wearables

Maps the [Open Wearables](https://openwearables.io) unified health data model to
FHIR R4.

Open Wearables is a self-hosted, MIT-licensed platform
([the-momentum/open-wearables](https://github.com/the-momentum/open-wearables)) that
already ingests Apple Health, Fitbit, Garmin, Google Health Connect, Oura, Polar,
Samsung Health, Sensorbio, Strava, Suunto, Ultrahuman and Whoop, and normalises all
of them onto one schema.

So this is not another vendor integration. It is one mapper against one normalised
schema, and it covers every provider that platform supports. Two of those — Apple
HealthKit and Google Health Connect — are on-device sources that a server-side Node
connector cannot reach at all on its own; Open Wearables reaches them through its
mobile SDKs and this package maps what comes out.

---

## Read this before using it

**Nothing in this package has been verified against a running Open Wearables
instance.**

The intended plan was to run their stack with `docker compose up` and map against
live responses. Docker is not installed on the machine this was written on and
installing it was out of scope, so there was no server to record against.

Everything here is reconstructed from primary sources: the FastAPI response models,
the series-type table the API reads, the platform's own example payloads, and the
published documentation. Every field, its source URL, its unit and whether that unit
is confirmed or assumed is recorded in
[`docs/open-wearables-contract.md`](./docs/open-wearables-contract.md), together
with a ranked list of what must be re-checked the moment someone can run a server.

The FHIR side *is* verified. The bundle this package builds from its fixtures is
registered in `verify/bundles.manifest.ts` and passes the HL7 validator with zero
errors.

---

## What it does

- Parses `GET /users/{id}/timeseries`, `/events/sleep` and `/events/workouts` with
  zod schemas transcribed field-for-field from the platform's pydantic models.
- Maps 52 of the platform's 93 series types to FHIR Observations — 12 under LOINC
  codes taken from the shared, already-reviewed `LOINC_UNITS` table, the other 40
  under a Foundation-controlled code system with `TODO(clinical-review):` against
  each.
- Maps sleep sessions to a sleep-duration Observation with the stage breakdown as
  components, and workouts to an exercise-duration Observation with the aggregates
  as components.
- Emits one `Device` resource per distinct (provider, model) pair and references it
  from every Observation it produced, so a consumer can tell an Oura heart rate from
  a Garmin one. This uses standard `Observation.device`; the package declares **no
  FHIR extension at all**.
- Carries the subject's local UTC offset into `effective[x]` (D7), derives stable
  UUIDv5 resource ids so a re-sync updates rather than duplicates (D2), and returns
  an `OperationOutcome` describing everything it refused (D6).

## What it does NOT do

- **No HTTP client.** There is no `createOpenWearablesClient`. Writing one that
  could not be run against a server would have shipped an untested auth flow,
  pagination loop and error taxonomy under the appearance of a working connector.
  The endpoint paths and the `X-Open-Wearables-API-Key` header are recorded as
  constants and documented as unverified. Fetch the pages yourself; hand the bodies
  to `buildOpenWearablesBundle`.
- **No pagination.** `next_cursor` is parsed and ignored. The caller pages.
- **41 of 93 series types are refused**, each with a recorded reason. Sixteen of
  those are refused because the platform's own two descriptions of the unit
  disagree — including `blood_alcohol_content`, declared `mg_dl` in one file and
  sent as `g/dL` in another, and `insulin_delivery`, declared `count` and sent in
  `IU`. Fourteen more are refused only because `@open-twin/fhir-core` has no UCUM
  entry for their unit (mmHg, mg/dL, kg/m², W, L, L/min, dB, mL); those are the
  cheapest to fix and are listed as required shared changes. The remaining eleven
  are ambient readings, position, a single-sourced unit, or things FHIR models as
  something other than an Observation.
- **No summaries, no menstrual cycles, no health scores.** `/summaries/activity`,
  `/summaries/sleep`, `/summaries/recovery`, `/summaries/body` and
  `/events/menstrual-cycles` exist and are not mapped.
- **No sleep stage intervals.** `SleepSession.sleep_stage_intervals` is parsed and
  discarded; only the aggregate stage minutes are mapped.
- **No `avg_pace_sec_per_km`.** No UCUM entry for seconds per kilometre, and pace is
  recoverable from the distance and duration this package does publish. The drop is
  reported as an issue, not done silently.

## Assumptions that could not be verified

Ranked by how much damage a wrong answer would do. The full list, with sources, is
in §8 of the contract document.

1. **That `duration_seconds` and `sleep_duration_seconds` are seconds.** Everything
   downstream divides by 60. The field names say seconds and the platform's own
   example payload is consistent with seconds (30600 for a 22:00–06:30 night). If
   they are already minutes, every sleep duration this package emits is 60× too
   small.
2. **That the API sends the unit strings in `SERIES_TYPE_DEFINITIONS`**, not the
   ones in the example payloads. The mapper accepts both spellings wherever they
   differ only in spelling, so this is hedged — but a third spelling nobody has seen
   produces a refusal, and a bundle that is empty for the wrong reason.
3. **That the dimensional conflicts are bugs in the example payloads rather than in
   the unit table.** Sixteen series types are refused on that disagreement; roughly
   that many could be mapped once a live sample settles which side is right.
4. **That `zone_offset` is usually populated.** D7 depends on it. When it is absent
   this package emits `Z`, which is honest and, for a wearer in Zurich, not useful.
5. **That `source.provider` is stable across syncs for the same hardware.** Device
   identity is keyed on it. It is free text — `data_source.source or "unknown"` —
   not the `ProviderName` enum.
6. **That `is_daily_total` is only set for step and energy series.** Daily totals of
   any other type are refused rather than published under a point-in-time code.
7. **That the documented `recovery_score` series type does not exist on the wire.**
   It is in the docs and in the example payloads but absent from the `SeriesType`
   enum the API validates against, so this package treats it as unknown.
8. **That LOINC 2708-6 is the right additional code for SpO₂ by pulse oximetry.**
   Its authority here is the R4 `oxygensat` profile, which fixes it; it is the one
   LOINC code in this package that does not come from the shared `LOINC_UNITS`
   table.

## Usage

```ts
import { buildOpenWearablesBundle } from '@open-twin/open-wearables';

const { bundle, issues } = buildOpenWearablesBundle(
  {
    userId: '…',                 // the Open Wearables user id, never an email
    timeseries: timeseriesBody,  // the raw response body, unparsed
    sleepSessions: sleepBody,
    workouts: workoutsBody
  },
  { timestamp: new Date().toISOString() }
);

// `issues` is a FHIR OperationOutcome naming everything that was refused, and why.
// It is undefined when nothing was.
if (issues) console.warn(issues.issue.map((i) => i.diagnostics));
```

Supply `subject` when you know who the patient is and the reference is used
verbatim. Omit it and the bundle gets a deterministic `urn:uuid:` subject plus a
matching `Patient` carrying an identifier and nothing else (D1).

Pass `type: 'transaction'` for a bundle whose entries carry `PUT Observation/<id>`,
if your server upserts.

## Verification

```
npx tsc --noEmit           # clean
npx vitest run             # 69 tests
node ../../verify/build-conformance.mjs
npx tsx ../../verify/emit-bundles.ts /tmp/nc-out
java -jar validator_cli.jar /tmp/nc-out/open-wearables-sync.json \
  -version 4.0.1 -ig ../../verify/conformance/generated -tx n/a \
  -best-practice ignore -jurisdiction uv -output-style compact -level errors
```

The validator reports **zero errors**. It reports warnings that
`http://opentwin.ch/fhir/CodeSystem/open-wearables` cannot be resolved; that is
correct and stays until the code system is declared in
`verify/conformance/declarations.json` and the implementation guide publishes it.
This package deliberately declares no extension, so it adds no validator errors that
a shared file has to be edited to clear.
