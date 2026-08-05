# Finding: header fill quality

**Status.** Pre-existing from the headers introduced under #18 / this stack.
Recorded here so it is not mistaken for a #19 regression. Own PR(s) to fix —
do not mix into the Oura CORRECTNESS repair.

## Thesis, applied to this convention

`verify/check-headers.ts` validates that `CORRECTNESS` is **non-empty**. It
cannot validate that the cited authority is **true** for that module. A green
blocking headers gate therefore does **not** mean the headers are correct.
That is this project's founding observation — green tests are not correctness —
arriving on the convention built to carry context.

## Pattern 1 — identical GOVERNED BY paste

**68** exporting modules share this byte-identical line:

`GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6`

The set spans vendor API schemas, fixtures, genomics VCF parsers, HL7 v2
tables, FHIR validate helpers, and verification `exampleBundle` modules — not
only one narrow structural layer.

`d1`, `d2`, and `d6` are broad enough that any single citation may be
defensible. The paste signature is unambiguous: nobody verified the three
anchors module-by-module when the headers were filled. Treat identical
`GOVERNED BY` across unrelated packages as a work queue, not as evidence of
review.

## Pattern 2 — GOVERNED BY line shape vs CONVENTIONS.md

**154 of 155** headers write `GOVERNED BY:` **without** the leading ` * ` that
`docs/CONVENTIONS.md` shows inside the block comment.

`check-headers` accepts that form because its field regex makes the asterisk
optional (`*?`). The gate is therefore more permissive than its own published
spec. A future tighten (require the starred shape) would be a deliberate
breaking change to the gate, not a silent expectation.

## Out of scope here

- Wrong-package Oura `CORRECTNESS` lines — fixed on this PR tip when present.
- Dangling `ADR 0004` / `ADR 0010` prose inside `CORRECTNESS` — retargeted to
  `DECISIONS.md#d4` / `#d10` on this tip. Note: `check-docs` only inspects
  `GOVERNED BY`, not `CORRECTNESS`, so dead ADR wording in CORRECTNESS would
  not have failed the docs gate.
