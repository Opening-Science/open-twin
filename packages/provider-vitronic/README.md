# Open Twin Vitronic Provider

A provider for connecting Vitronic device to the Open Twin ecosystem. This package retrieves user and device data from Vitronic and transforms it into an open, standardized format for interoperable processing and further analysis.

## Features

Library only (D8): HTTP client + FHIR mapping. There is no runner or CLI in this
package. Host-side scan cycle tooling lives outside this repository
(twin-llm `scripts/vitronic/cycle.ts`).

---

## Installation

Install the package via npm:

```bash
npm install @open-twin/provider-vitronic
```

### Setup & Prerequisites

#### Authentication

BodyLoop accepts either:

1. The OAuth resource-owner **password grant** (`grant_type=password`) — BodyLoop's
   documented contract, discouraged by current OAuth guidance, still required when
   no API token exists.
2. An admin-minted **Bearer API token** (`apiToken`). The client then never posts
   username or password.

Provide secrets only from the host application's secret manager. The connector
holds them in memory only; it does not persist them and its errors and FHIR
`OperationOutcome` diagnostics never include request or response bodies, tokens,
or passwords.

```ts
createBodyLoopClient({ baseUrl, username, password, scope: 'admin' });
createBodyLoopClient({ baseUrl, apiToken, scope: 'admin' });
```

#### TLS

A self-signed scanner certificate is trusted only when `tlsFingerprintSha256` is
the SHA-256 of that certificate's DER. Mismatch throws `TlsPinMismatchError`
(wrapped as `ConnectorError` code `transport`). The library never sets
`NODE_TLS_REJECT_UNAUTHORIZED`. Without a pin, Node's default TLS verification
applies.

```ts
createBodyLoopClient({
  baseUrl,
  apiToken,
  scope: 'admin',
  tlsFingerprintSha256
});
```

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

const scans = await client.getAvailableViatars(probandId);
```

`issues` is a FHIR `OperationOutcome` and is present only when something failed. A
scope that could not be fetched does not discard the scopes that could.

`getAvailableViatars(probandId?)` GETs `/api/v2/viatars/` and, when an integer
`probandId` is supplied, keeps rows whose `proband_id` equals it. It never calls
`/probands`. The FHIR ingest path uses `getViatar` for `proband_id` the same way.

### What the mapping asserts

| BodyLoop | FHIR | Unit |
|---|---|---|
| `angles.*`, `rotation.*` | `Observation.valueQuantity` / `component` | `deg` — the API reports **radians**, which are converted (D10) |
| `position`, `distances.*`, `height`, `circumferences.*` | `component` / `valueQuantity` | `m` (D10) |
| `areas.*` | `component` | `m2` |
| `normal.*` | `component` | `1` — a surface normal is a direction vector, not an angle |
| `properties` `body.height` | `valueQuantity` | `m` (D15) |
| `properties` `body.surface` | `valueQuantity` | `m2` (D15) |
| `properties` `body.volume` | `valueQuantity` | `m3` (D15) — not litre |
| `properties` `body.mass` | `valueQuantity` | `kg` (D15) |
| `properties` `body.bmi` | `valueQuantity` | `kg/m2` (D15) — scanner figure, not recomputed |
| other `properties[].value` | `value[x]` | none — unknown paths stay unitless (D15) |

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
