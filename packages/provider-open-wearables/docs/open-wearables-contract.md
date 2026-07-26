# The Open Wearables contract, as far as it can be established without a server

**Status: unverified against a running Open Wearables instance.**

This document exists because the intended oracle was not available. The plan was to
run `docker compose up`, sync a real account, and map against live responses. Docker
is not installed on the machine this connector was written on and installing it was
out of scope, so there was no server to record against and no response to compare
this mapping to.

What follows is therefore reconstructed entirely from primary sources in the Open
Wearables repository and its published documentation. Every field is quoted with the
file it came from. Every unit is marked **confirmed by two independent sources**,
**declared by one source only**, or **contradicted**. Nothing here has been observed
on the wire.

All source links are pinned to commit
[`2e3e6dd`](https://github.com/the-momentum/open-wearables/tree/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57)
(2026-07-24), the tip of `main` when this connector was written. A later commit may
say something different, and this document will not know.

---

## 1. What "confirmed" means here

Two independent constructs inside the platform describe units, and this connector
treats agreement between them as the strongest available evidence.

**Source A — the table the API reads.** `SERIES_TYPE_DEFINITIONS` binds each series
type to a unit string:

```python
SERIES_TYPE_DEFINITIONS: list[tuple[int, SeriesType, str]] = [
    (1, SeriesType.heart_rate, "bpm"),
    ...
    (20, SeriesType.oxygen_saturation, "percent"),
```

<https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/schemas/enums/series_types.py#L178-L311>

That table is what the API actually serves. `TimeSeriesService.get_timeseries` sets
the response `unit` from it and from nothing else:

```python
series_type = get_series_type_from_id(sample.series_type_definition_id)
unit = get_series_type_unit(series_type)
...
item = TimeSeriesSample(timestamp=..., type=series_type, value=float(sample.value), unit=unit, ...)
```

<https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/services/timeseries_service.py#L182-L205>

**Source B — the platform's own example payloads.** `EXAMPLE_PAYLOADS` is a
hand-written sample for every webhook event type, built by a helper that emits
exactly the `TimeSeriesSample` shape:

```python
def _ts_payload(event_type: str, series_type: str, provider: str, unit: str, sample_value: float) -> dict:
```

<https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/constants/webhooks/test_payloads.py#L21-L45>

**Source C — the published data-types table**, which lists a display unit per series
type: <https://docs.openwearables.io/architecture/data-types>. Used as
corroboration, not as a primary contract: it is prose about the code.

### The finding that shaped the whole design

**A and B disagree, and not only about spelling.** The spelling differences are
benign — `percent` vs `%`, `celsius` vs `°C`, `brpm` vs `breaths/min`. The
dimensional ones are not:

| Series type | Source A declares | Source B sends | Consequence of trusting the wrong one |
|---|---|---|---|
| `blood_alcohol_content` | `mg_dl` | `g/dL` | a factor of 1000 |
| `walking_step_length` | `cm` | `m` (0.72) | a factor of 100; 0.72 cm is not a step |
| `running_stride_length` | `cm` | `m` (1.24) | a factor of 100 |
| `insulin_delivery` | `count` | `IU` | doses read as a count |
| `physical_effort` | `score` | `MET·min` | a bounded score read as an energy-time product |
| `stair_ascent_speed` / `stair_descent_speed` | `m_per_s` | `floors/min` | incommensurable |
| `peripheral_perfusion_index` | `score` | `%` | — |
| `atrial_fibrillation_burden` | `count` | `%` | a burden fraction read as an event count |
| `electrodermal_activity` | `count` | `S` | siemens read as a count |
| `sleeping_breathing_disturbances` | `count` | `count/h` | a count read as a rate |
| `breathing_disturbance_index` | `score` | `count/h` | — |
| `garmin_body_battery` | `percent` | `score` | both 0-100, so the error is invisible |
| `garmin_skin_temperature` | `celsius`, enum comment says *deviation from baseline* | `°C`, example is an absolute 35.8 | `Cel` vs `K` |
| `uv_exposure` | `count` | `J/m²` | — |
| `nike_fuel` | `count` | `NikeFuel` | a proprietary index with no UCUM expression |

Source C sides with B on the spellings and adds one more discrepancy of its own: it
documents a `recovery_score` timeseries type that is **absent from the `SeriesType`
enum** the API validates against, so a request for it would be rejected by FastAPI.

Two conclusions follow, and both are implemented rather than merely noted:

1. **The mapper keys on `type`, never on `unit`.** The unit on the wire is not a
   contract, so it cannot be the thing that decides how a number is interpreted.
2. **A sample is mapped only when its `unit` is one this connector has seen in a
   primary source for that type.** Anything else is refused and reported as an
   `OperationOutcome` issue. A series type whose two sources disagree is refused
   outright.

Refusing is recoverable: the data is still in Open Wearables and a later release can
map it. Publishing a thousand-fold error under a standard LOINC code is not.

---

## 2. Endpoints this connector parses

| Endpoint | Response model | Source |
|---|---|---|
| `GET /api/v1/users/{user_id}/timeseries` | `PaginatedResponse[TimeSeriesSample]` | [timeseries.py#L17-L36](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/api/routes/v1/timeseries.py#L17-L36) |
| `GET /api/v1/users/{user_id}/events/sleep` | `PaginatedResponse[SleepSession]` | [events.py#L43-L67](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/api/routes/v1/events.py#L43-L67) |
| `GET /api/v1/users/{user_id}/events/workouts` | `PaginatedResponse[Workout]` | [events.py#L21-L40](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/api/routes/v1/events.py#L21-L40) |

Authentication is documented as the header `X-Open-Wearables-API-Key`
(<https://docs.openwearables.io/architecture/data-types>). **Unverified** — this
package ships no HTTP client, so nothing here has been exercised against a server.

---

## 3. `TimeSeriesSample` — every field

Source:
[data_point_responses.py#L11-L20](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/schemas/responses/activity/data_point_responses.py#L11-L20)

| Field | Declared type | Unit status | Mapped to |
|---|---|---|---|
| `timestamp` | `datetime` | n/a | `Observation.effectiveDateTime`, re-expressed in `zone_offset` |
| `zone_offset` | `ZoneOffset` (`^[+-]\d{2}:\d{2}$`, [dates.py#L30-L40](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/utils/dates.py#L30-L40)) | n/a | the offset of `effectiveDateTime` (D7) |
| `type` | `SeriesType` | n/a | selects `Observation.code`, `category`, unit and profile |
| `value` | `float \| int` | see §4 | `Observation.valueQuantity.value` |
| `unit` | `str` | **not trusted** | validated against §4, never used to scale |
| `source` | `SourceMetadata \| None` | n/a | a `Device` resource, referenced from `Observation.device` |
| `is_daily_total` | `bool \| None` | n/a | selects the 24-hour code where one exists |

`source.provider` is **free text, not the `ProviderName` enum**: the service builds
it as `data_source.source or "unknown"`
([timeseries_service.py#L190-L194](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/services/timeseries_service.py#L190-L194)).
It is carried verbatim into `Device.manufacturer` and never coerced into a code.

---

## 4. Series types this connector maps

Columns: the unit `SERIES_TYPE_DEFINITIONS` declares; every spelling this connector
accepts on the wire; the FHIR code(s); the UCUM code emitted; whether an R4
vital-signs profile is declared.

52 of the platform's 93 series types are here: 12 under LOINC codes, 40 under
vendor-local ones. Every unit below is **confirmed by at least two of sources A, B
and C**. Two entries still need a caveat and they are in §4.1.

Every LOINC code below is taken from `LOINC_UNITS` in
`@open-twin/fhir-core` — the repository's already-reviewed set — with its unit read
from that table rather than restated, so this connector cannot emit LOINC 8302-2 in
metres while another emits it in centimetres (D4).

Everything under `local` is `http://opentwin.ch/fhir/CodeSystem/open-wearables` and
carries `TODO(clinical-review):` in the source. **No standard code is claimed for
any of them.** That is not a claim that none exists — only that none was verified.

| Series type | Declared unit | Accepted on the wire | FHIR code | UCUM | R4 profile |
|---|---|---|---|---|---|
| `heart_rate` | `bpm` | `bpm` | LOINC 8867-4 | `/min` | yes |
| `resting_heart_rate` | `bpm` | `bpm` | LOINC 40443-4 + LOINC 8867-4 | `/min` | yes |
| `respiratory_rate` | `brpm` | `brpm`, `breaths/min` | LOINC 9279-1 | `/min` | yes |
| `oxygen_saturation` | `percent` | `percent`, `%` | LOINC 59408-5 + LOINC 2708-6 | `%` | yes |
| `body_temperature` | `celsius` | `celsius`, `°C` | LOINC 8310-5 | `Cel` | yes |
| `height` | `cm` | `cm` | LOINC 8302-2 | `cm` | yes |
| `weight` | `kg` | `kg` | LOINC 29463-7 | `kg` | yes |
| `body_fat_percentage` | `percent` | `percent`, `%` | LOINC 41982-0 | `%` | — |
| `vo2_max` | `ml_kg_min` | `ml_kg_min`, `mL/kg/min` | LOINC 94122-9 | `mL/kg/min` | — |
| `exercise_time` | `minutes` | `minutes`, `min` | LOINC 55411-3 | `min` | — |
| `steps` | `count` | `count` | LOINC 55423-8 | `{steps}` | — |
| `steps` (daily total) | `count` | `count` | LOINC 41950-7 | `{steps}/d` | — |
| `energy` | `kcal` | `kcal` | LOINC 41981-2 | `kcal` | — |
| `energy` (daily total) | `kcal` | `kcal` | local `energy-burned-24h` | `kcal` | — |
| `heart_rate_variability_sdnn` | `ms` | `ms` | local `hrv-sdnn` | `ms` | — |
| `heart_rate_variability_rmssd` | `ms` | `ms` | local `hrv-rmssd` | `ms` | — |
| `heart_rate_recovery_one_minute` | `bpm` | `bpm` | local `heart-rate-recovery-1min` | `/min` | — |
| `walking_heart_rate_average` | `bpm` | `bpm` | local `walking-heart-rate-average` | `/min` | — |
| `skin_temperature` | `celsius` | `celsius`, `°C` | local `skin-temperature` | `Cel` | — |
| `skin_temperature_deviation` | `celsius` | `celsius`, `°C` | local `skin-temperature-deviation` | `K` | — |
| `skin_temperature_trend_deviation` | `celsius` | `celsius`, `°C` | local `skin-temperature-trend-deviation` | `K` | — |
| `lean_body_mass` | `kg` | `kg` | local `lean-body-mass` | `kg` | — |
| `body_fat_mass` | `kg` | `kg` | local `body-fat-mass` | `kg` | — |
| `skeletal_muscle_mass` | `kg` | `kg` | local `skeletal-muscle-mass` | `kg` | — |
| `waist_circumference` | `cm` | `cm` | local `waist-circumference` | `cm` | — |
| `cardiovascular_age` | `years` | `years` | local `cardiovascular-age` | `a` | — |
| `garmin_fitness_age` | `years` | `years` | local `garmin-fitness-age` | `a` | — |
| `basal_energy` | `kcal` | `kcal` | local `basal-energy` | `kcal` | — |
| `active_time` | `minutes` | `minutes`, `min` | local `active-time` | `min` | — |
| `stand_time` | `minutes` | `minutes`, `min` | local `stand-time` | `min` | — |
| `flights_climbed` | `count` | `count` | local `flights-climbed` | `{count}` | — |
| `distance_walking_running` | `meters` | `meters`, `m` | local `distance-walking-running` | `m` | — |
| `distance_cycling` | `meters` | `meters`, `m` | local `distance-cycling` | `m` | — |
| `distance_swimming` | `meters` | `meters`, `m` | local `distance-swimming` | `m` | — |
| `distance_downhill_snow_sports` | `meters` | `meters`, `m` | local `distance-downhill-snow-sports` | `m` | — |
| `distance_other` | `meters` | `meters`, `m` | local `distance-other` | `m` | — |
| `six_minute_walk_test_distance` | `meters` | `meters`, `m` | local `six-minute-walk-test-distance` | `m` | — |
| `underwater_depth` | `meters` | `meters`, `m` | local `underwater-depth` | `m` | — |
| `speed` | `m_per_s` | `m_per_s`, `m/s` | local `speed` | `m/s` | — |
| `walking_speed` | `m_per_s` | `m_per_s`, `m/s` | local `walking-speed` | `m/s` | — |
| `running_speed` | `m_per_s` | `m_per_s`, `m/s` | local `running-speed` | `m/s` | — |
| `running_ground_contact_time` | `ms` | `ms` | local `running-ground-contact-time` | `ms` | — |
| `running_vertical_oscillation` | `cm` | `cm` | local `running-vertical-oscillation` | `cm` | — |
| `swimming_stroke_count` | `count` | `count` | local `swimming-stroke-count` | `{count}` | — |
| `push_count` | `count` | `count` | local `push-count` | `{count}` | — |
| `time_in_daylight` | `minutes` | `minutes`, `min` | local `time-in-daylight` | `min` | — |
| `walking_double_support_percentage` | `percent` | `percent`, `%` | local `walking-double-support-percentage` | `%` | — |
| `walking_asymmetry_percentage` | `percent` | `percent`, `%` | local `walking-asymmetry-percentage` | `%` | — |
| `walking_steadiness` | `percent` | `percent`, `%` | local `walking-steadiness` | `%` | — |
| `average_met` | `met` | `met`, `MET` | local `average-met` | `{MET}` | — |
| `garmin_stress_level` | `score` | `score` | local `garmin-stress-level` | `{score}` | — |
| `workout_effort_score` | `score` | `score` | local `workout-effort-score` | `{score}` | — |
| `estimated_workout_effort_score` | `score` | `score` | local `estimated-workout-effort-score` | `{score}` | — |
| `number_of_times_fallen` | `count` | `count` | local `number-of-times-fallen` | `{count}` | — |

### 4.0 The repository's terminology gate cannot see most of this table

`verify/check-terminology.mjs` finds a code only when a string literal sits in the
same object or call as `SYSTEMS.LOINC`. This connector builds its codes through
`loincMeasure(code, display, options)`, so inside the helper `code` is a variable and
the scanner skips it — a case the scanner itself documents as "dynamically built
code; cannot be reviewed statically".

The practical effect is that the gate reports only the four codes written as
literals in the sleep and workout mappers (55411-3, 93829-0, 93830-8, 93831-6) and
is blind to the other fourteen. **This is under-reporting, not compliance.** The
eighteen distinct LOINC codes this connector can emit are:

> 8867-4, 40443-4, 9279-1, 59408-5, 2708-6, 8310-5, 8302-2, 29463-7, 41982-0,
> 94122-9, 55411-3, 55423-8, 41950-7, 41981-2, 93832-4, 93831-6, 93830-8, 93829-0

All eighteen need the same sign-off as any other code, and seventeen of them were
already in the repository's reviewed `LOINC_UNITS` table before this connector
existed. Teaching the gate to follow a table-driven mapper is listed as a required
shared change.

### 4.1 The two entries that need a caveat

- `time_in_daylight` — the unit is corroborated (`minutes` in A, `min` in B), but
  source C notes the type is defined and not currently produced by any provider, so
  this mapping has never had a value to carry.
- `energy` as a **daily total** — the unit is confirmed, but the *concept* is not.
  LOINC 41979-6 "Calories burned in 24 hour" is the right code and is absent from
  the shared `LOINC_UNITS` table; choosing its unit here would be the per-connector
  unit drift D4 exists to prevent. A vendor-local `energy-burned-24h` is emitted
  instead, in `kcal`. **TODO(clinical-review).**

### 4.2 Two LOINC codes on one Observation

`resting_heart_rate` and `oxygen_saturation` each carry two LOINC codes. This is not
belt-and-braces. The R4 vital-signs profiles require a specific "magic" code and
permit more precise ones alongside it, and the HL7 validator applies `heartrate` to
LOINC 40443-4 whether or not the profile is declared:

```
Bundle.entry[7]...code: Error - HeartRateCode: magic LOINC code 8867-4 required, but not found
Bundle.entry[8]...code: Error - OxygenSatCode: magic LOINC code 2708-6 required, but not found
```

Both were found by running the validator, not by reading the specification. The
specific code is emitted first so a consumer reading `coding[0]` still learns that
the reading is a resting one, or by pulse oximetry.

LOINC **2708-6** is the only code in this connector that does not come from
`LOINC_UNITS`. Its authority is the R4 `oxygensat` profile itself
(<http://hl7.org/fhir/R4/oxygensat.html>), which fixes it; its unit is the profile's
fixed `%`, identical to the unit already bound to 59408-5.

---

## 5. Series types this connector refuses

Refusals are in the code, not only in this document: `UNRESOLVED_SERIES` in
`src/fhir/seriesMap.ts`, and every refusal is reported to the caller as an
`OperationOutcome` issue at map time. A test asserts that every one of the 93
members of the platform's `SeriesType` enum is either mapped or listed here, so
"declined" can never be confused with "overlooked".

| Series type | Reason | Detail |
|---|---|---|
| `blood_alcohol_content` | unit-conflict | Declared mg_dl in series_types.py; example payload sends g/dL. A factor of 1000 apart. |
| `walking_step_length` | unit-conflict | Declared cm; example payload sends 0.72 m. 0.72 cm is not a step length. |
| `running_stride_length` | unit-conflict | Declared cm; example payload sends 1.24 m. 1.24 cm is not a stride. |
| `physical_effort` | unit-conflict | Declared score; example payload sends MET·min. A score and an energy-time product are not the same axis. |
| `stair_ascent_speed` | unit-conflict | Declared m_per_s; example payload sends floors/min. |
| `stair_descent_speed` | unit-conflict | Declared m_per_s; example payload sends floors/min. |
| `peripheral_perfusion_index` | unit-conflict | Declared score; example payload sends %. |
| `garmin_body_battery` | unit-conflict | Declared percent; example payload sends score. Both are 0-100, which is what makes the confusion durable. |
| `atrial_fibrillation_burden` | unit-conflict | Declared count; example payload sends %. |
| `electrodermal_activity` | unit-conflict | Declared count; example payload sends S (siemens). |
| `insulin_delivery` | unit-conflict | Declared count; example payload sends IU. Refusing an insulin dose is the only safe reading of that. |
| `uv_exposure` | unit-conflict | Declared count; example payload sends J/m². |
| `nike_fuel` | unit-conflict | Declared count; example payload sends NikeFuel, a proprietary index with no UCUM expression. |
| `sleeping_breathing_disturbances` | unit-conflict | Declared count; example payload sends count/h. A count and a rate are different quantities. |
| `breathing_disturbance_index` | unit-conflict | Declared score; example payload sends count/h. |
| `garmin_skin_temperature` | unit-conflict | The enum comment calls it a deviation from baseline; the example payload is an absolute 35.8 °C. Deviation and absolute need different UCUM codes (K vs Cel). |
| `blood_pressure_systolic` | no-ucum-code | Both sources agree on mmHg. @open-twin/fhir-core has no mm[Hg] entry and this package may not add one. |
| `blood_pressure_diastolic` | no-ucum-code | Both sources agree on mmHg. @open-twin/fhir-core has no mm[Hg] entry and this package may not add one. |
| `blood_glucose` | no-ucum-code | Both sources agree on mg/dL. No mg/dL entry in @open-twin/fhir-core, and DECISIONS.md records that the LOINC code for mass vs substance concentration is itself unresolved. |
| `body_mass_index` | no-ucum-code | Both sources agree on kg/m². No kg/m2 entry in @open-twin/fhir-core. |
| `power` | no-ucum-code | watts. No W entry in @open-twin/fhir-core. |
| `running_power` | no-ucum-code | watts. No W entry in @open-twin/fhir-core. |
| `cadence` | no-ucum-code | rpm. No entry in @open-twin/fhir-core, and "revolutions per minute" for a running cadence is really steps per minute — the denominator is agreed, the numerator is not. |
| `forced_vital_capacity` | no-ucum-code | liters. No L entry in @open-twin/fhir-core. |
| `forced_expiratory_volume_1` | no-ucum-code | liters. No L entry in @open-twin/fhir-core. |
| `peak_expiratory_flow_rate` | no-ucum-code | L/min. No entry in @open-twin/fhir-core. |
| `hydration` | no-ucum-code | mL. No mL entry in @open-twin/fhir-core. |
| `environmental_audio_exposure` | no-ucum-code | Declared dB; example payload sends dBASPL. No dB entry in @open-twin/fhir-core either. |
| `headphone_audio_exposure` | no-ucum-code | Declared dB; example payload sends dBASPL. No dB entry in @open-twin/fhir-core either. |
| `environmental_sound_reduction` | no-ucum-code | dB. No dB entry in @open-twin/fhir-core. |
| `weather_temperature` | not-a-patient-observation | Ambient weather, not a property of the subject. It belongs on the encounter context, not on an Observation about the patient. |
| `weather_humidity` | not-a-patient-observation | Ambient weather, not a property of the subject. |
| `air_temperature` | not-a-patient-observation | Ambient air, not a property of the subject. |
| `water_temperature` | not-a-patient-observation | Ambient water, not a property of the subject. |
| `latitude` | not-a-patient-observation | Position. Publishing it as a patient Observation would put a location trace in a clinical record. |
| `longitude` | not-a-patient-observation | Position. Publishing it as a patient Observation would put a location trace in a clinical record. |
| `elevation` | not-a-patient-observation | Position. Part of a location trace. |
| `running_vertical_ratio` | single-source | Declared percent in series_types.py and mentioned nowhere else — no example payload, no docs table entry. One source is not a contract. |
| `running_stance_time_balance` | single-source | Declared percent in series_types.py and mentioned nowhere else. A left/right balance percentage also needs a side, which the sample carries nowhere. |
| `inhaler_usage` | wrong-fhir-element | Both sources agree on count, but a count of inhaler doses is a medication administration, not an observation about the body. MedicationAdministration is the right resource and this connector does not build one. |
| `number_of_alcoholic_beverages` | wrong-fhir-element | Both sources agree on count. The correct FHIR category is social-history, which the shared CATEGORY table in @open-twin/fhir-core does not offer; filing substance use under survey or activity misfiles it more damagingly than omitting it. |

`no-ucum-code` is the cheapest category to clear: each needs one entry in the `UCUM`
table in `@open-twin/fhir-core`, which this connector may not edit. They are listed
as required shared changes.

---

## 6. `SleepSession` — every field

Source:
[events.py#L61-L72](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/schemas/responses/activity/events.py#L61-L72),
stage summary at
[summaries.py#L43-L47](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/schemas/responses/activity/summaries.py#L43-L47).

| Field | Declared unit | Status | Mapped to | UCUM |
|---|---|---|---|---|
| `id` | — | — | `Observation.id` seed and `Identifier.value` | — |
| `start_time` / `end_time` | — | — | `Observation.effectivePeriod` | — |
| `zone_offset` | — | — | the offset of both period ends | — |
| `duration_seconds` | seconds | **confirmed by the field name and by the `int` column type**; not otherwise corroborated | component `sleep-session-duration` | `min` after ÷60 |
| `sleep_duration_seconds` | seconds | same | `Observation.valueQuantity`, LOINC 93832-4 | `min` after ÷60 |
| `efficiency_percent` | percent | confirmed: the field is `Field(None, ge=0, le=100)` on the sibling `SleepSummary` | component `sleep-efficiency` | `%` |
| `stages.deep_minutes` | minutes | confirmed by field name; example payload sends 90 for a 510-minute night, which is consistent with minutes and not with seconds | component, LOINC 93831-6 | `min` |
| `stages.light_minutes` | minutes | same | component, LOINC 93830-8 | `min` |
| `stages.rem_minutes` | minutes | same | component, LOINC 93829-0 | `min` |
| `stages.awake_minutes` | minutes | same | component `sleep-awake-duration` | `min` |
| `is_nap` | — | — | component `sleep-session-kind` = `nap` \| `main-sleep` | — |
| `source` | — | — | `Device` | — |
| `sleep_stage_intervals` | — | — | **parsed, not mapped** | — |

Two decisions worth arguing with:

- **`duration_seconds` is not published as LOINC 103213-5 "Duration in bed".** The
  `SleepDetails` table has a separate `sleep_time_in_bed_minutes` column
  ([sleep_details.py#L29](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/models/sleep_details.py#L29))
  that the `SleepSession` response does not expose, so `duration_seconds` is the
  event's wall-clock length. Equating the two would be an inference.
- **Sleep efficiency uses a vendor-local code.** This repository has already
  rejected SNOMED 248263006 (Duration of sleep) for it, and DECISIONS.md lists
  sleep efficiency among the concepts with no verified standard term.
  **TODO(clinical-review).**

The platform's own example sleep payload
([test_payloads.py#L93-L112](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/constants/webhooks/test_payloads.py#L93-L112))
omits `sleep_duration_seconds` while supplying `duration_seconds`. The mapped
Observation therefore carries `dataAbsentReason`, not a value. Substituting time in
bed for time asleep, or zero, are both worse than saying nothing.

---

## 7. `Workout` — every field

Source:
[events.py#L14-L28](https://github.com/the-momentum/open-wearables/blob/2e3e6dd6dcbfb8f2521d062748ca2fc2d698ce57/backend/app/schemas/responses/activity/events.py#L14-L28).

| Field | Declared unit | Status | Mapped to | UCUM |
|---|---|---|---|---|
| `id` | — | — | `Observation.id` seed and `Identifier.value` | — |
| `type` | — | — | component `workout-type`, as a code | — |
| `name` | — | — | component `workout-label`, `valueString` | — |
| `start_time` / `end_time` / `zone_offset` | — | — | `Observation.effectivePeriod` | — |
| `duration_seconds` | seconds | confirmed by field name and by the example payload (3600 for an 08:00-09:00 run) | `Observation.valueQuantity`, LOINC 55411-3 | `min` after ÷60 |
| `calories_kcal` | kcal | confirmed by field name and example | component, LOINC 41981-2 | `kcal` |
| `distance_meters` | metres | confirmed by field name and example (8500 for a 60-minute run) | component `workout-distance` | `m` |
| `elevation_gain_meters` | metres | confirmed by field name and example | component `workout-elevation-gain` | `m` |
| `avg_heart_rate_bpm` | bpm | confirmed by field name and example | component `workout-heart-rate-average` | `/min` |
| `max_heart_rate_bpm` | bpm | same | component `workout-heart-rate-maximum` | `/min` |
| `avg_pace_sec_per_km` | s/km | confirmed by field name and example (424 s/km against 8500 m in 3600 s = 424 s/km, which checks out arithmetically) | **not mapped** | — |
| `source` | — | — | `Device` | — |

`type` is a free string in the response model — the platform's own comment on the
field reads `# Should be WorkoutType enum ideally` — so it is carried as a code
under the Open Wearables code system rather than validated against a value set this
connector would have to invent.

`avg_pace_sec_per_km` is dropped because `@open-twin/fhir-core` has no UCUM entry
for seconds per kilometre and pace is recoverable from distance and duration, both
of which are published. The drop is reported as an issue rather than done silently.

**Neither `avg_heart_rate_bpm` nor `max_heart_rate_bpm` is published under a LOINC
heart-rate code.** LOINC 8867-4 is a point-in-time measurement and an average over
an hour is a different property; LOINC 8873-2 is explicitly a 24-hour maximum and a
workout is not 24 hours. Both use vendor-local codes.
**TODO(clinical-review).**

---

## 8. What would have to be re-checked against a running instance

In rough order of how much damage a wrong answer would do.

1. **Which unit string the API actually sends per series type.** The mapper accepts
   only spellings seen in a primary source and refuses everything else, so a
   mismatch produces a refusal and an issue rather than a wrong number — but it also
   produces an empty bundle, which is its own kind of failure. Fetch one sample per
   series type and compare `unit` against `SERIES_MAP`.
2. **Whether the dimensional conflicts in §1 are real on the wire, and which side
   wins.** Twenty-one series types are refused on the strength of a disagreement
   between two files. Sixteen series types are refused for that reason alone. One
   live sample each settles it, and most of them could then be mapped.
3. **Whether `duration_seconds` and `sleep_duration_seconds` are really seconds.**
   Everything downstream divides by 60. If either is already minutes, every sleep
   duration this connector emits is 60× too small. The field names and the platform's
   own example payload both say seconds; nothing has confirmed it.
4. **What `is_daily_total` is set to in practice, and for which series types.** The
   connector switches LOINC codes on it for steps and refuses it for everything
   else. If the platform sets it for, say, `energy` and `distance_*` routinely, that
   refusal drops real data.
5. **Whether `zone_offset` is populated.** D7 depends on it. If it is usually null,
   every daily boundary silently reverts to UTC and summaries land on the wrong day
   for anyone not at UTC+00:00. The connector emits `Z` in that case, which is
   honest but not useful.
6. **Whether `source.provider` is stable enough to key a `Device` on.** It is free
   text (`data_source.source or "unknown"`). If it varies between syncs for the same
   hardware, each sync mints new Device resources.
7. **Whether `SleepSession.duration_seconds` equals `end_time - start_time`.** If it
   does not, the assumption in §6 that it is the wall-clock length is wrong and it is
   probably time in bed after all — which would make LOINC 103213-5 correct.
8. **Whether `recovery_score` exists on the wire.** The docs and the example
   payloads both have it; the enum does not. If the server serves it, this connector
   refuses a whole metric.
9. **Pagination.** `next_cursor` is parsed and ignored: this package maps a page it
   is handed and has no client to follow cursors with. A caller syncing a week of
   raw heart rate will page, and nothing here has been tested against a real cursor.

---

## 9. Things this document does not cover

`GET /summaries/activity`, `/summaries/sleep`, `/summaries/recovery`,
`/summaries/body`, `/events/menstrual-cycles`, health scores, the FHIR-adjacent MCP
server, and the mobile SDK upload path. They exist and are documented; they are not
mapped, so no claim is made about them here.
