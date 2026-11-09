# @open-twin/reader-core

One interface over every open-twin connector. An adapter in each ingestion package
extends `HealthDataReader`. Decision [D16](../../DECISIONS.md#d16);
specification `docs/specs/reader-architecture.md` (#229).

**Layer (D14):** the ingestion layer's interface. This package maps no vendor format,
scores nothing and interprets nothing.

## What is here

| Module      | Purpose                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `types.ts`  | Descriptor, metadata, host services with `TokenStore` and `CursorStore` (D8), request, result                |
| `reader.ts` | `IHealthDataReader`, `ReaderWrapper`                                                                         |
| `base.ts`   | `HealthDataReader`: lifecycle, subject (D1), bundle key (D2), `fetchJson`, stores                            |
| `utils/`    | `fileText`, `fileJson`, `issueFromOperationOutcome`, `withConnectorTag`, `Parser`, `subjectIdentifierSystem` |

The conformance suite, `OAuthReader`, wrappers and the CLI follow in their own pull requests.

## Writing an adapter

```ts
import { buildBundle } from '@open-twin/fhir-core';
import { HealthDataReader, type ReaderDescriptor, type ReadRequest, type ReadResult } from '@open-twin/reader-core';

export class ExampleReader extends HealthDataReader {
  readonly descriptor: ReaderDescriptor = { id: 'example', name: 'Example', version: '0.1.0', kind: 'api', ... };

  protected async onOpen(input) {
    // parse the config with this.parseConfig(schema, input.config);
    // restore tokens with this.loadTokens(input.tokenKey). Never fetch health data here.
  }

  protected async onClose() {
    // save changed tokens or a cursor; runs on every close.
  }

  async read(request: ReadRequest): Promise<ReadResult> {
    const subject = this.subjectFor(request);              // D1: caller reference or urn:uuid plus Patient
    const bundle = buildBundle({                            // D2: ids stable for the same key
      connector: this.connector,
      resources: [...(subject.patient ? [subject.patient] : []), ...observations],
      timestamp: this.now(),
      bundleKey: this.bundleKeyFor(request)                 // reader | subject | types | window
    });
    return { bundle, issues, provenance: this.provenanceFor(bundle) };
  }
}
```

One instance serves one connection: `open` fails while the reader is open, and a failed
`open` leaves it closed.

Rules the base class leaves to the adapter: every Observation carries the connector
meta tag (`connectorMeta` from fhir-core), units are `UCUM.*`, missing data is
`dataAbsentReason` and never 0, source offsets are kept (D7), and no error or issue ever
quotes a response body, a token, a name or an e-mail.

## Intended use

Research and non-medical consumer wellness only; see [INTENDED-USE](../../docs/INTENDED-USE.md).
