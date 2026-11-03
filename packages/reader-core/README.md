# @open-twin/reader-core

One interface over every open-twin connector. An adapter in each ingestion package
extends `HealthDataReader`, and the shared conformance suite makes every reader pay the
same price: the eight rules of the reader architecture spec, run over the package's own
fixtures. Decision [D16](../../DECISIONS.md#d16);
specification `docs/specs/reader-architecture.md` (#229).

**Layer (D14):** the ingestion layer's interface. This package maps no vendor format,
scores nothing and interprets nothing.

## What is here

| Module        | Purpose                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `types.ts`    | Descriptor, metadata, host services with `TokenStore` and `CursorStore` (D8), request, result       |
| `reader.ts`   | `IHealthDataReader`, `ReaderWrapper`                                                                |
| `base.ts`     | `HealthDataReader` and `OAuthReader`: lifecycle, subject (D1), bundle key (D2), `fetchJson`, stores |
| `registry.ts` | `loadRegistry`, `descriptorOf`, `resolveReader`, the generated schema and table                     |
| `testing/`    | `describeReaderConformance`, `describeTokenBridge`, `summarise`, host test doubles                  |

The delegating reader, other wrappers and the CLI follow in their own pull requests.

## Writing an adapter

An API reader behind OAuth 2.0 extends `OAuthReader` instead: give it `configSchema` and
`tokenHandlerFor(config, code)`, and open and close are done. It requires a per-wearer
`tokenKey` with no default; `describeTokenBridge` tests that behaviour.

```ts
import { HealthDataReader, type ReaderDescriptor, type ReadRequest, type ReadResult } from '@open-twin/reader-core';

export class ExampleReader extends HealthDataReader {
  readonly descriptor: ReaderDescriptor = { id: 'example', name: 'Example', version: '0.1.0', kind: 'api', ... };

  protected override async onOpen(input) {
    // parse the config with this.parseConfig(schema, input.config);
    // restore tokens with this.loadTokens(input.tokenKey). Never fetch health data here.
  }

  async read(request: ReadRequest): Promise<ReadResult> {
    const subject = this.subjectFor(request);              // D1: caller reference or urn:uuid plus Patient
    const bundle = this.bundleFrom({                        // D2: ids stable for the same key
      resources: [...(subject.patient ? [subject.patient] : []), ...observations],
      bundleKey: this.bundleKeyFor(request)                 // reader | subject | types | window
    });
    return { bundle, issues, provenance: this.provenanceFor(bundle) };
  }
}
```

Rules the base class leaves to the adapter: every Observation carries the connector
meta tag (`connectorMeta` from fhir-core), units are `UCUM.*`, missing data is
`dataAbsentReason` and never 0, source offsets are kept (D7), and no error or issue ever
quotes a response body, a token, a name or an e-mail.

## Running the conformance suite

In the adapter package's tests:

```ts
import { validateFhir } from '@open-twin/fhir-r4';
import { describeReaderConformance } from '@open-twin/reader-core/testing';

describeReaderConformance(() => new ExampleReader(), {
  descriptor, // descriptorOf(the entry in registry/connectors.json)
  fixtures: [{ name, input, host, request, expected }],
  invalidInput, // open must reject it with ConnectorError 'validation'
  validate: validateFhir, // rule 4
  secrets: { 'access token': '...', 'wearer id': '...' } // rule 7
});
```

`expected.json` is generated with `summarise` from a run the author has checked, never
written by hand. It pins counts per resource type and per code, the effective range and
the number of value-less Observations.

What the suite does and does not establish:

- Rule 2 checks the reader's own fixtures only. The other half, that the delegator binds
  the expected reader for every other reader's fixtures, lands with `delegate.ts`.
- Rule 4 runs the validator the adapter injects. The HL7 validator, the UCUM gate and the
  terminology gate still run over `verify/bundles.manifest.ts` in CI; register the
  fixture bundle there.
- Rule 5 cannot tell a genuine 0 from 0-for-missing; rule 8 catches it only when the
  fixture contains a missing value, so include one.
- Rule 6 checks distinct windows only when the fixture request has a window.
- Rule 7 checks serialised issues, provenance and log lines against the `secrets` you
  list, plus e-mail addresses and token fields. It cannot know a name you did not list.

`src/tests/fake-reader.test.ts` shows every rule failing on a deliberately broken reader
and passing on the correct one.

## Intended use

Research and non-medical consumer wellness only; see [INTENDED-USE](../../docs/INTENDED-USE.md).
