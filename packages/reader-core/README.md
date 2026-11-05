# @open-twin/reader-core

One interface over every open-twin connector. Decision [D16](../../DECISIONS.md#d16);
specification `docs/specs/reader-architecture.md` (#229).

**Layer (D14):** the ingestion layer's interface. This package maps no vendor format,
scores nothing and interprets nothing.

## What is here

| Module      | Purpose                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| `types.ts`  | Descriptor, metadata, host services with `TokenStore` and `CursorStore` (D8), request, result |
| `reader.ts` | `IHealthDataReader`, `ReaderWrapper`                                                          |

The base class, the conformance suite, wrappers and the CLI follow in their own pull requests.

## Intended use

Research and non-medical consumer wellness only; see [INTENDED-USE](../../docs/INTENDED-USE.md).
