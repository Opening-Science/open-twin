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
| [findings/parked-for-24-fhir-core-anchor-content.md](findings/parked-for-24-fhir-core-anchor-content.md) | engineer | Consumed when branch 24 lands fhir-core Anchor/lab UCUM bodies |

Later branches land `contracts/`, `terminology/`, `strategy/`, and `runbooks/`
and extend this map when those trees exist.

## Layout

```
docs/
  00-MAP.md
  CONVENTIONS.md
  GLOSSARY.md
  findings/      things that are wrong and known
```

Root [`DECISIONS.md`](../DECISIONS.md) is the decision log. Do not treat root
narrative docs as the system description — open the module.
