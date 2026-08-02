# Interpreter golden fixtures

One directory per **rule family**. Each contains:

- `input.json` — `EvaluateInput` (observations + `as_of` + `subject_ref`)
- `expected.json` — canonical serialized interpretation document for that family only

## Determinism

Same pack + same `input.json` must produce byte-identical `expected.json`.
CI fails if they drift.

## Regenerating

Do not hand-edit `expected.json`. Regenerate with a written reason:

```bash
pnpm --filter @open-twin/interpreter regen-golden -- --reason "explain why the output changed"
```

Optional: `--family hepatic`

Reasons are appended to `REASONS.md`. A change that alters a golden without a
deliberate regen (and reason) fails CI.
