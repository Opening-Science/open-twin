# Module header conventions

The **code** is the primary context carrier. Documentation under `docs/` is a
glossary and decision log — consulted second, never instead of the file you are
in.

## Required header

Every module under `packages/*/src/` or `src/` that `export`s anything must open
with exactly this block (field labels and order fixed; wording of values is per
module):

```
/**
 * WHAT: one sentence on what this module does.
 * NOT:  what this module must not do, and where that responsibility lives.
 * GOVERNED BY: path to the contract, DECISIONS.md entry, or spec this implements.
 * CORRECTNESS: which external authority establishes this is right
 *              (UCUM grammar / HL7 validator / signed review record /
 *              recorded API response / golden fixture). Never "unit tests".
 * GOTCHA: the thing that will bite the next reader. Omit only if there is none.
 */
```

### Rules

1. `WHAT`, `NOT`, `GOVERNED BY`, and `CORRECTNESS` are mandatory and must be
   non-empty after the colon.
2. `GOTCHA` is optional. If present, it must be non-empty.
3. `CORRECTNESS` must never be "unit tests", "the tests pass", or equivalent.
4. Where no external authority backs the module, write exactly:
   `NONE — see docs/findings/no-external-authority.md`
   and list the file in that finding.
5. `GOVERNED BY` must point at a path that exists (DECISIONS.md entry, contract, or recorded
   decision). Prefer `DECISIONS.md#dn` and `docs/contracts/…`. Never `docs/adr/`.

## Enforcement

- `verify/check-headers.ts` — header presence and shape
- `verify/check-docs.ts` — `docs/00-MAP.md` integrity and GOVERNED BY targets
- Both run under `pnpm verify` via `verify/run-verify.ts`
