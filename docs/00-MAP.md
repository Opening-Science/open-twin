# Documentation map

Index of `docs/`. Owner is the role accountable for keeping the file true.
Update trigger is the event that must refresh it.

Cross-cutting decisions live in root [`DECISIONS.md`](../DECISIONS.md) — not under
`docs/`. Headers point at `DECISIONS.md#dn`. Never at `docs/adr/`.

| Doc | Owner | Update trigger |
|---|---|---|
| [CONVENTIONS.md](CONVENTIONS.md) | architect | Header shape or verify-script change |
| [GLOSSARY.md](GLOSSARY.md) | architect | New domain term introduced in code |
| [findings/](findings/) | whoever discovers the defect | New known-wrong or authority gap |
| [findings/no-external-authority.md](findings/no-external-authority.md) | architect | Module gains or loses external authority |
| [findings/verify-baseline.md](findings/verify-baseline.md) | architect | Verify gate picture / dual terminology / intentional reds |
| [findings/parked-for-fhir-connector-content.md](findings/parked-for-fhir-connector-content.md) | engineer | Consumed when open-twin/fhir-connector lands fhir-core Anchor/lab UCUM bodies |
| [findings/header-fill-quality.md](findings/header-fill-quality.md) | architect | Header paste / shape debt; gate cannot verify CORRECTNESS truth |
| [contracts/](contracts/) | package owner | Interface / schema change |
| [contracts/interpretation-contract.v0.2.schema.json](contracts/interpretation-contract.v0.2.schema.json) | interpretation | Sole open-twin ↔ openXR interpretation interface |
| [terminology/](terminology/) | clinical reviewer + engineer | Allowlist or review procedure change |
| [runbooks/verify-a-code.md](runbooks/verify-a-code.md) | engineer | How to sign a review record |
| [findings/missing-non-anchor-review-records.md](findings/missing-non-anchor-review-records.md) | engineer | G2b debt after allowlist reconciliation |
| [findings/anchor-layer-audit.md](findings/anchor-layer-audit.md) | engineer | Anchor compile counts / D-e mismatches |
| [findings/canary-suite.md](findings/canary-suite.md) | architect | Deliberately-wrong canaries and uncaught findings |

Later branches land `strategy/`. This branch lands `contracts/` (interpretation schema + confidence). Terminology and runbooks already on main.

## Layout

```
docs/
  00-MAP.md
  CONVENTIONS.md
  GLOSSARY.md
  findings/      things that are wrong and known
  contracts/     interpretation schema + confidence
  terminology/   allowlist / review procedure
  runbooks/      human procedures (e.g. verify-a-code)
```

Root [`DECISIONS.md`](../DECISIONS.md) is the decision log. Do not treat root
narrative docs as the system description — open the module.
