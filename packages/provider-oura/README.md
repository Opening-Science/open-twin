# Open Twin Oura Provider

A provider for connecting Oura devices and APIs to the Open Twin ecosystem. This package retrieves user and device data from Oura and transforms it into an open, standardized format for interoperable processing and further analysis.

## Features

* **Token Exchange:** Fetches the `access_token` using an initial user authorization code.
* **Token Refresh:** Automatically refreshes the `access_token` using a `refresh_token`.
* **Data Retrieval:** Fetches granular Oura health and device data for a specific user.
* **FHIR Standardization:** Converts raw Oura data formats into the HL7 FHIR standard for medical/health interoperability.

> **Note:** This package does not handle the initial OAuth2 user authentication where permissions are explicitly granted in the providers website. That must be managed by your client application.

---

## Installation

Install the package via npm:

```bash
npm install @open-twin/provider-oura
```

### Setup & Prerequisites

1. Head over to the [Oura Developer Portal](https://developer.ouraring.com/applications) and create a new application.
2. Once registered, Oura will provide you with a `CLIENT_ID` and a `CLIENT_SECRET` (and `CLIENT_URI`).

---

## Usage

### `TokenHandler(config, authorizationToken)`

A helper class which handles the runtime storage and automatic refreshing of the tokens

#### Parameters

* **`config`** (`OuraRingAppConfig`): The interface which holds the Oura application details

```ts
interface OuraRingAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: SupportedScope[];
}
```

* **`authorizationToken`** (`string`): The code that has been returned after the user's initial authorization process

#### Example

```ts
const ouraRingAppConfig: OuraRingAppConfig = {
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: "YOUR_CLIENT_SECRET",
    redirectUri: "YOUR_REDIRECT_URI"
};

const authorizationToken = 'USER_AUTH_TOKEN';

const tokenHandler = new TokenHandler(ouraRingAppConfig, options.auth_code);

// Initial token exchange
await tokenHandler.authenticate();

// Or you can directly set the tokens
// tokenHandler.setTokens({access_token: string, token_type: "bearer", expires_in: number, refresh_token: string})

// Returns the access token. If token is expired, refreshes and returns it.
await tokenHandler.getAccessToken()

```

---

### `getOuraData(request, tokenHandler)`

Retrieves the Oura Data types specified in the request

#### Parameters

* **`request`** (`RequestParams`): The parameters required to make a request

```ts
interface RequestParams {
    types: string[];
    start_date?: string | undefined;
    end_date?: string | undefined;
    next_token?: string | null | undefined;
    fields?: string[] | undefined;
    latest?: boolean | null | undefined;
}
```

* **`tokenHandler`** (`TokenHandler`): The runtime token handler class for automatic token refresh

#### Return Value

Returns a `Promise<(SupportedSchemaTypes[SupportedSchemaName] | OuraPersonal)[]>` with the following structure:

#### Example

```ts

import { getOuraData } from '@open-twin/provider-oura';

const request = {
    types: ["heartrate", "sleep", "workout", "spo2", "personal"],
    start_date: "2026-07-01",
    end_date: "2026-07-02",
};

try {
  const response = await getOuraData(request, tokenHandler);
  console.log("Response:", JSON.stringify(data, null, 2));
} catch (error) {
  console.error("An error happened:", error);
}
```

---

### `getFhirBundleFromOuraData(request, tokenHandler, sandbox)`

Retrieves the Oura Data types specified in the request and converts it into FHIR standard to return as a Bundle of data

#### Parameters

* **`request`** (`RequestParams`): The parameters required to make a request

```ts
RequestParams: interface {
    types: string[];
    start_date?: string | undefined;
    end_date?: string | undefined;
    next_token?: string | null | undefined;
    fields?: string[] | undefined;
    latest?: boolean | null | undefined;
}
```

* **`tokenHandler`** (`TokenHandler`): The runtime token handler class for automatic token refresh

* **`sandbox`** (`boolean`): A flag to choose if the request should be true values or mocked ones. Default false

#### Return Value

Returns a `Promise<Bundle>`

#### Example

```ts
import { getFhirBundleFromOuraData } from '@open-twin/provider-oura';

const request = {
    types: ["heartrate", "sleep", "workout", "spo2", "personal"],
    start_date: "2026-07-01",
    end_date: "2026-07-02",
};

try {
  const response = await getFhirBundleFromOuraData(request, bearerToken);
  console.log("Response:", JSON.stringify(data, null, 2));
} catch (error) {
  console.error("An error happened:", error);
}
```

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
