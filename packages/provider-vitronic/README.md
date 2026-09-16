# Open Twin Vitronic Provider

A provider for connecting Vitronic device to the Open Twin ecosystem. This package retrieves user and device data from Vitronic and transforms it into an open, standardized format for interoperable processing and further analysis.

## Features

(t.b.d.)

---

## Installation

Install the package via npm:

```bash
npm install @open-twin/provider-vitronic
```

### Setup & Prerequisites

#### Authentication limitation

BodyLoop's available API contract requires the OAuth resource-owner password grant:
the client sends the configured `username` and `password` to the BodyLoop token
endpoint with `grant_type=password`. This legacy grant is discouraged by current
OAuth guidance and should be replaced if VITRONIC offers a supported delegated or
machine-to-machine alternative.

Until then, provide credentials only from the host application's secret manager.
The connector holds them in memory only for token requests; it does not persist
them and its errors and FHIR `OperationOutcome` diagnostics never include request
or response bodies. Do not put credentials in source code, logs, or bundle data.

---

## Usage

```ts
import { createBodyLoopClient, getFhirBundleFromVitronicData } from '@open-twin/provider-vitronic';

const client = createBodyLoopClient({ baseUrl, username, password, scope: 'admin' });

const { bundle, issues } = await getFhirBundleFromVitronicData(client, viatarId, ['angle', 'distance'], {
  // Optional. The connector does not know who the patient is; an integrator that
  // does should say so. Without it, a deterministic `urn:uuid:` subject is derived
  // from the scan's proband id and a matching Patient travels in the bundle.
  subject: { reference: 'Patient/1234' }
});
```

`issues` is a FHIR `OperationOutcome` and is present only when something failed. A
scope that could not be fetched does not discard the scopes that could.

### What the mapping asserts

| BodyLoop | FHIR | Unit |
|---|---|---|
| `angles.*`, `rotation.*` | `Observation.valueQuantity` / `component` | `deg` — the API reports **radians**, which are converted |
| `position`, `distances.*`, `height`, `circumferences.*` | `component` / `valueQuantity` | `m` |
| `areas.*` | `component` | `m2` |
| `normal.*` | `component` | `1` — a surface normal is a direction vector, not an angle |
| `properties[].value` | `value[x]` | none — the API states no unit, and one is not invented |

Measurement paths are published as codes in the Foundation-controlled CodeSystem
`http://opentwin.ch/fhir/CodeSystem/vitronic`. No LOINC or SNOMED CT code is
asserted for a BodyLoop measurement: no reviewed mapping table exists yet, and a
wrong standard code is unrecoverable where a vendor-local one is not.

## Disclaimer

This project is an independent and unofficial integration for Vitronic services and device. It is not affiliated with, endorsed by, sponsored by, or otherwise associated with VITRONIC Machine Vision GmbH.

## Trademarks

“VITRONIC” is a trademark of VITRONIC Machine Vision GmbH. All product names, logos, and brands are property of their respective owners.

Use of these names does not imply endorsement or affiliation.

## License

MIT
