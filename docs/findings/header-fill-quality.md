# Finding: header fill quality

**Status.** Pre-existing from the headers landed via #18 / #19. Own PR(s) to
fix — do not bury inside product branches.

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

## Pattern 3 — CORRECTNESS is invisible to path checks (sharpest)

`check-docs` scans **GOVERNED BY only**. Dead ADR references written as prose
in `CORRECTNESS` are invisible to both gates.

Four such references were found by review, not by CI: three Vitronic mappers
citing `ADR 0010` and `fhir-core/observation.ts` citing `ADR 0004`, all
pointing at a `docs/adr/` tree that does not exist on this tip. Fixed in
`8c299f7` (retargeted to `DECISIONS.md#d10` / `#d4`). **The gap is not.**

## Follow-up scope

1. Audit / rewrite the 68 identical `d1;d2;d6` GOVERNED BY lines module-by-module.
2. Decide whether `check-headers` should require the starred `GOVERNED BY` shape
   matching CONVENTIONS.md.
3. **`check-docs` should scan every header field for dead path references, not
   just GOVERNED BY** — including bare `ADR NNNN` / `docs/adr/…` /
   `docs/contracts/ADR-*` prose inside CORRECTNESS (and GOTCHA if present).

## Already fixed elsewhere (not this finding's job)

- Wrong-package Oura `CORRECTNESS` on five non-Oura `exampleBundle.ts` files
  (`8c299f7`).
- The four dangling ADR prose cites above (`8c299f7`).
