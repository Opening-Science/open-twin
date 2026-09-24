# open-twin

TypeScript libraries for converting vendor health data, HL7 v2 messages and VCF
files into **HL7 FHIR R4 bundles**, validating incoming FHIR, and reconciling
matching measurements across sources.

Developed under the Open Science Foundation for **research and non-medical
consumer wellness**. Experimental interpretation modules support research
hypothesis generation. **Medical use is outside the intended scope**; see
[intended use](docs/INTENDED-USE.md).

## Get started

Use Node 22 (as in CI; `engines` declares >=20) and pnpm 11.17.0.

```bash
npm install -g pnpm@11.17.0
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm verify
pnpm emit-bundles out/
```

Build first: workspace packages resolve each other's compiled exports.
CI also runs the official HL7 validator; a local validator run requires Java 21. See [Onboarding](ONBOARDING.md).

## Packages

Automated npm publishing is disabled; use the source checkout.

Ten connector and core library packages (names use the `@open-twin/` scope):

| package | direction | source |
|---|---|---|
| [`fhir-core`](packages/fhir-core) | — | the shared contract: systems, units, identity, provenance, errors |
| [`aggregate`](packages/aggregate) | — | cross-source reconciliation |
| [`provider-oura`](packages/provider-oura) | vendor → FHIR | Oura Ring v2 API |
| [`provider-whoop`](packages/provider-whoop) | vendor → FHIR | WHOOP Developer API v2 |
| [`provider-google-health`](packages/provider-google-health) | vendor → FHIR | Google Health API v4 |
| [`provider-vitronic`](packages/provider-vitronic) | vendor → FHIR | VITRONIC BodyLoop body scanner |
| [`open-wearables`](packages/provider-open-wearables) | vendor → FHIR | OpenWearables normalised schema |
| [`fhir-r4`](packages/fhir-r4) | FHIR → FHIR | foreign R4 bundles: validation + normalisation |
| [`hl7v2`](packages/hl7v2) | HL7 v2 → FHIR | ORU/ADT messages |
| [`genomics-vcf`](packages/genomics-vcf) | VCF → FHIR | variant calls, Genomics Reporting IG |

Four additional workspace packages — `anchor-layer`, `provider-anchor`,
`interpretation-contract` and `interpreter` — are research modules.
Package READMEs document their APIs and supported inputs.

The Google Health connector uses `health.googleapis.com/v4`; it is not an
Android Health Connect integration.

## Scope and verification

This is an experimental library collection. Applications supply scheduling,
storage, authentication, access controls and user interfaces.

Verification combines unit tests, UCUM and terminology checks, and example-bundle validation. Some terminology reviews and semantic canaries remain advisory or record known gaps; see the [verification baseline](docs/findings/verify-baseline.md). Passing CI does not establish clinical accuracy, regulatory conformity or correctness for every input.

Tests once passed on output that carried radians labelled as degrees; see
[BUILD-SUMMARY.md](BUILD-SUMMARY.md) for the defect history.

Before handling participant data or exposing outputs to consumers, read
[Intended use and integration responsibilities](docs/INTENDED-USE.md) and,
for US audiences, the [US supplement](docs/US-USE.md).

## Documentation

| Read | For |
|---|---|
| [ONBOARDING.md](ONBOARDING.md) | Setup, verification and first contribution |
| [DECISIONS.md](DECISIONS.md) | Shared identity, terminology, units and interpretation rules |
| [docs/00-MAP.md](docs/00-MAP.md) | Detailed documentation map |
| [Contributing.md](Contributing.md) | Contribution and review workflow |
| [CLAUDE.md](CLAUDE.md) | Coding-agent instructions |
| [BUILD-SUMMARY.md](BUILD-SUMMARY.md) | Dated architecture and review record |
| [PROVENANCE.md](PROVENANCE.md) | Repository history |
| [docs/synthea.md](docs/synthea.md) | Synthetic FHIR cohort generation |

Development and pull requests for this repository are hosted at
[Opening-Science/open-twin](https://github.com/Opening-Science/open-twin).

## Licence and independence

[MIT](LICENSE) covers project code and documentation to the extent the copyright
holders can grant those rights. Third-party terminology, datasets and vendor services
may have separate terms; see [third-party rights](docs/INTENDED-USE.md#third-party-rights).
Vendor names identify independent integrations and do not imply endorsement.
