# open-twin-provider-oura

A provider for connecting Oura devices and APIs to the Open Twin ecosystem. This package retrieves user and device data from Oura and transforms it into an open, standardized format for interoperable processing and further analysis.

## Features

t.b.d.

## Installation

t.b.d. (npm install @open-twin/provider-oura)

## Usage

t.b.d.

## Oura to FHIR Mappings

### Sleep

| OURA Data Feature             | FHIR Correspondence                     | Clinical Code (LOINC / SNOMED) |
| :---------------------------- | :-------------------------------------- | :----------------------------- |
| `id`                          | `Observation.identifier`                |                                |
| `bedtime_start`               | `Observation.effectivePeriod.start`     |                                |
| `bedtime_end`                 | `Observation.effectivePeriod.end`       |                                |
| `score`                       | `Observation.valueQuantity`             | Custom (Oura System)           |
| `day`                         | `Observation.extension`                 |                                |
| `readiness_score_delta`       | `Observation.component.valueQuantity`   | Custom (Oura System)           |
| `rem_sleep_duration`          | `Observation.component.valueQuantity`   | 93829-0 (LOINC)                |
| `restless_periods`            | `Observation.component.valueQuantity`   | Custom (Oura System)           |
| `sleep_algorithm_version`     | `Observation.method`                    |                                |
| `sleep_analysis_reason`       | `Observation.note`                      |                                |
| `sleep_phase_30_sec`          | `Observation.extension`                 |                                |
| `sleep_phase_5_min`           | `Observation.extension`                 |                                |
| `sleep_score_delta`           | `Observation.component.valueQuantity`   | Custom (Oura System)           |
| `time_in_bed`                 | `Observation.component.valueQuantity`   | 103214-3 (LOINC)               |
| `total_sleep_duration`        | `Observation.component.valueQuantity`   | 93832-4 (LOINC)                |
| `type`                        | `Observation.category`                  |                                |
| `ring_id`                     | `Observation.device` _(Reference Type)_ |                                |
| `app_sleep_phase_5_min`       | `Observation.extension`                 |                                |
| `temperature_deviation`       | `Observation.component.valueQuantity`   | Custom (Oura System)           |
| `temperature_trend_deviation` | `Observation.component.valueQuantity`   | Custom (Oura System)           |

---

### Sleep Contributors

| OURA Data Feature    | FHIR Correspondence                   | Clinical Code (LOINC / SNOMED) |
| :------------------- | :------------------------------------ | :----------------------------- |
| `deep_sleep`         | `Observation.component.valueQuantity` | 93831-6 (LOINC)                |
| `efficiency`         | `Observation.component.valueQuantity` | 248263006 (SNOMED CT)          |
| `latency`            | `Observation.component.valueQuantity` | 103212-7 (LOINC)               |
| `rem_sleep`          | `Observation.component.valueQuantity` | 93829-0 (LOINC)                |
| `restfulness`        | `Observation.component.valueQuantity` | Custom (Oura System)           |
| `timing`             | `Observation.component.valueQuantity` | Custom (Oura System)           |
| `total_sleep`        | `Observation.component.valueQuantity` | 93832-4 (LOINC)                |
| `recovery_index`     | `Observation.component.valueQuantity` | Custom (Oura System)           |
| `resting_heart_rate` | `Observation.component.valueQuantity` | 40443-4 (LOINC)                |
| `sleep_balance`      | `Observation.component.valueQuantity` | Custom (Oura System)           |
| `sleep_regularity`   | `Observation.component.valueQuantity` | Custom (Oura System)           |

### Personal

| OURA Data Feature | FHIR Correspondence         | LOINC Code |
| :---------------- | :-------------------------- | :--------- |
| `id`              | `Observation.identifier`    |            |
| `weight`          | `Observation.valueQuantity` | 29463-7    |
| `height`          | `Observation.valueQuantity` | 8302-2     |
| `gender`          | `Patient.gender`            | 99501-9    |
| `age`             | `Now() - Patient.birthDate` |            |
| `email`           | `Observation.identifier`    |            |

### SpO2

| OURA Data Feature             | FHIR Correspondence             | LOINC Code |
| :---------------------------- | :------------------------------ | :--------- |
| `id`                          | `Observation.identifier`        |            |
| `breathing_disturbance_index` | `Observation.valueQuantity`     | 90566-1    |
| `spo2_percentage.average`     | `Observation.valueQuantity`     | 59408-5    |
| `day`                         | `Observation.effectiveDateTime` |            |

### Workout

| OURA Data Feature | FHIR Correspondence                          | LOINC Code | Notes                               |
| :---------------- | :------------------------------------------- | :--------- | :---------------------------------- |
| `id`              | `Observation.identifier`                     |            |                                     |
| `activity`        | `Observation.valueCodeableConcept`           | 73985-4    |                                     |
| `source`          | `Observation.method`                         |            |                                     |
| `intensity`       | `Observation.component.valueCodeableConcept` | 74008-4    |                                     |
| `start_datetime`  | `Observation.effectivePeriod.start`          |            |                                     |
| `end_datetime`    | `Observation.effectivePeriod.end`            |            |                                     |
| `day`             | `Observation.effectiveDateTime`              |            |                                     |
| `calories`        | `Observation.component.valueQuantity`        | 41981-2    |                                     |
| `distance`        | `Observation.component.valueQuantity`        | 112427-0   | Walking and running distance in 24h |
| `label`           | `Observation.note`                           |            |                                     |

## Disclaimer

This project is an independent and unofficial integration for Oura services and devices. It is not affiliated with, endorsed by, sponsored by, or otherwise associated with Oura LLC or Oura Health Oy.

“Oura” is a trademark of Oura Health Oy. All product names, logos, and brands are property of their respective owners.

## Trademarks

“Oura” is a trademark of Oura Health Oy.

Use of these names does not imply endorsement or affiliation.

## License

MIT
