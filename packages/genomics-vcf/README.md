# @open-twin/genomics-vcf

Turns a VCF file into FHIR R4 `Observation` resources conforming to the **Variant**
profile of the [HL7 Genomics Reporting Implementation Guide][ig] (STU3, v3.0.0).

```ts
import { vcfToFhirBundle } from '@open-twin/genomics-vcf';

const { bundle, issues, summary, variantCount } = vcfToFhirBundle(vcfText, {
  subject: { reference: 'Patient/1234' }, // optional; see "Subject" below
  coordinateSystem: 'one-based-character', // default
  timestamp: '2026-07-26T10:00:00Z'
});
```

`issues` is a FHIR `OperationOutcome` and is `undefined` when there was nothing to
report. `summary` is a machine-readable count per issue kind, including the expected
exclusions that are not FHIR issues. Absence of data never throws (D6).

---

## What it does

**Parses** the VCF header — `##fileformat`, `##INFO`, `##FORMAT`, `##contig`,
`##reference`, `##fileDate` — and the data lines. INFO and FORMAT values are read
according to the `Type` and `Number` the header declares, not according to what the
text happens to look like. A `Number=A` field with one comma-free value is a
one-element array; a `Number=1` `String` field whose value is `1019` stays a string.
Cardinality disagreements and type violations are reported, never silently coerced.

**Emits** one `Observation` per ALT allele per record:

| Element | LOINC | Source |
|---|---|---|
| `Observation.code` | 69548-6 Genetic variant assessment | fixed by the profile |
| `Observation.value[x]` | LL1971-2: LA9633-4 / LA9634-2 / LA18198-4 / LA11884-6 | GT for the selected sample |
| chromosome identifier | 48000-4, answers LL2938-0 | CHROM |
| reference sequence assembly | 62374-4, answers LL1040-6 | `##reference` / `##contig` `assembly=` |
| genomic ref allele | 69547-8 | REF |
| genomic alt allele | 69551-0 | one ALT |
| genomic allele start-end | 81254-5 (`Range`) | POS and REF length |
| genomic coordinate system | 92822-6, answers LL5323-2 | the option you chose |
| allelic state | 53034-5, answers LL381-5 | GT |
| allelic read depth | 82121-5 | FORMAT `AD`, element for this ALT |
| sample variant allelic frequency | 81258-6 | FORMAT `AF` only (see below) |
| discrete genetic variant | 81252-9 | ID column, rsIDs only |

Every code was verified twice before it was written down: against
`tx.fhir.org` (HL7's terminology server, LOINC 2.82, on 2026-07-26) for the concept
and its official display, and against the IG's own `StructureDefinition` JSON for
which slice fixes it. The method is recorded at the top of `src/fhir/terminology.ts`
so it can be repeated rather than trusted.

### Coordinates

VCF POS is **1-based and inclusive**; the variant spans `POS .. POS + REF.length - 1`.

The IG does **not** require 0-based interbase coordinates. It requires the sender to
*declare* which system the `exact-start-end` Range uses, through component 92822-6
bound to LOINC answer list LL5323-2, whose three members are `LA30100-4` 0-based
interval counting, `LA30101-2` 0-based character counting and `LA30102-0` 1-based
character counting. The IG's own worked examples use 1-based character counting.

So this connector implements both and applies neither silently:

- `coordinateSystem: 'one-based-character'` (default) — the VCF numbers unchanged,
  declared as `LA30102-0`. A SNV at POS 100 is `low 100, high 100`.
- `coordinateSystem: 'zero-based-interbase'` — declared as `LA30100-4`. The same SNV
  is `low 99, high 100`; the span is half-open, so `high - low` is the base count.

The ends coincide in the two systems; only the start differs, by exactly one. That is
tested directly (`src/tests/coordinates.unit.test.ts`), including the property that
`high` is identical under both — which is why "subtract one from both endpoints" is
wrong.

### Reference genome build

Taken from the header, never assumed. Candidates are `##reference` values that are
not paths or URIs, plus every `##contig` `assembly=` attribute. `GRCh37`, `GRCh37.3`,
`b37`, `hg19`, `human_g1k_v37`, `GRCh38`, `hg38`, `NCBI36`/`hg18`, `NCBI35`/`hg17`,
`NCBI34`/`hg16` map to LL1040-6. Anything else, a disagreement between two header
lines, or nothing at all produces **no assembly component and a reported issue**.

A `##reference` that is a file path is ignored deliberately: it is an absolute path
into the producing institution's filesystem, and reading a build out of a FASTA
filename is a guess.

### Multi-allelic sites

`ALT=C,CA` produces two Observations that share coordinates and REF but carry their
own ALT string, their own allelic state and their own resource id. `AD` (`Number=R`)
is indexed per ALT, so ALT 2 gets `AD[2]`, not `AD[0]` or `AD[1]`.

Genotype `1/2` is **heterozygous for both** variants. Treating "no reference allele
present" as homozygous would publish a compound heterozygote as two homozygotes.

### FILTER

Only records whose FILTER is `PASS` or `.` are mapped. Anything else is the caller's
own pipeline saying it does not believe the call; those records are excluded and
counted in `summary['record-filtered']`.

There is deliberately no option to include them. The Variant profile's
`variant-confidence-status` component binds to a code system this connector could not
verify (`variant-confidence-status-vs` does not resolve on tx.fhir.org), so an
included record would be indistinguishable from a confident one in the output.
Excluding and counting is recoverable; publishing a filtered call as `status: final`
is not.

### Subject

D1. A caller-supplied `subject` is used verbatim. Otherwise the connector derives a
`urn:uuid:` reference from the VCF sample column name and emits a matching `Patient`
carrying nothing but its id.

**The sample column name is never published.** It is hashed into resource ids and
appears nowhere in the output. A sample name is chosen by whoever ran the sequencer
and is sometimes a person's name.

A VCF with **no sample columns** names no individual, and the connector refuses to
convert it without an explicit `subject` rather than inventing one.

---

## What it does NOT do

Named explicitly, because a silently-unsupported construct is worse than a refused
one. Each of these is skipped and counted under its own kind in `summary`.

| Not supported | Behaviour |
|---|---|
| **Structural variants** — symbolic ALTs (`<DEL>`, `<DUP>`, `<INS>`, `<CNV>`) | skipped, `alt-symbolic-unsupported` |
| **Breakends** (`A[chr2:321682[`) | skipped, `alt-breakend-unsupported` |
| **gVCF reference blocks** (`<NON_REF>`, `<*>`, `END=` with no ALT) | skipped, `gvcf-reference-block-skipped` |
| **Spanning deletions** (`*` ALT) | skipped, `alt-spanning-deletion-skipped`; other ALTs on the line are still mapped |
| **Multi-sample joint calls** | one bundle is one subject: pass `sampleId`, or a `ConnectorError` is thrown |
| **Phasing** | `\|` is parsed and `VcfGenotype.phased` reports it, but no phase information reaches FHIR. The IG's `sequence-phase-relationship` profile is not emitted |
| **BCF, bgzip, tabix** | plain text only; decompress before calling |
| **Normalisation / left-alignment** | REF and ALT are emitted verbatim, VCF padding base included, exactly as the file has them |
| **Liftover between builds** | never; the build is reported, not converted |

Components the IG defines that this connector does not emit, and why:

- **48004-6 DNA change (c.HGVS)** — c. HGVS is relative to a transcript, and a VCF
  carries no transcript. Emitting a g. expression under the c. code would be the
  exact defect class this repository is being remediated for.
- **81290-9 Genomic (gDNA) change (gHGVS)** and **48013-7 Genomic reference sequence**
  — both need a RefSeq accession (`NC_000001.11`). Deriving one from `chr1` plus a
  build requires a mapping table nobody here has verified.
- **48001-2 Cytogenetic (chromosome) location** — a cytoband. Not derivable from a
  VCF position without a band table.
- **48018-6 Gene studied** — needs annotation the VCF does not carry.
- **48002-0 Genomic source class** (germline / somatic) — a VCF does not say.
  Defaulting to germline would be an unfounded clinical assertion.
- **48019-4 DNA change type** — `TODO(clinical-review)`. The STU3 binding is to
  Sequence Ontology descendants of `SO:0002072`, and the value set names the system
  `http://www.sequenceontology.org` while FHIR R4's own registry names it
  `http://sequenceontology.org`. Neither the SO codes nor the correct system URI
  could be verified against a primary source, so nothing is emitted.
- **variant-confidence-status** — see FILTER above.

---

## Assumptions that could not be verified

- `TODO(clinical-review):` the UCSC `hg*` build names are mapped to their GRC
  equivalents (`hg19` → GRCh37, `hg38` → GRCh38, `hg18` → NCBI Build 36.1). The
  equivalence is conventional but not exact — hg19 and GRCh37 differ in the
  mitochondrial sequence and in contig naming. Nothing here converts a coordinate
  between builds, so the difference does not affect any emitted number, but a
  reviewer should confirm the receiving systems accept the alias.
- `TODO(clinical-review):` allelic read depth is emitted with UCUM `{count}`. A read
  count has no UCUM atom; `{count}` is an annotation on the unity, which a conformant
  parser discards. `LOINC_UNITS` in `@open-twin/fhir-core` has no entry for 82121-5.
- **VCF 4.0 and 4.1 files are accepted.** The connector targets 4.2/4.3, but the
  simple-variant grammar is unchanged across 4.0–4.3, and the committed HiSeq
  fixture is a real 4.0 file. A `##fileformat` outside that range is parsed anyway
  and reported as `fileformat-out-of-scope`.
- **`##fileDate` format.** VCF does not fix it. `YYYYMMDD` and `YYYY-MM-DD` are read;
  anything else yields no `effective[x]` and an `effective-date-absent` issue.
- **`Observation.identifier` is not set.** D2 wants a Foundation-controlled
  `Identifier.system`, and there is no `http://opentwin.ch/fhir/sid/genomics-vcf` in
  `SYSTEMS` yet. `Observation.id` is deterministic (`uuidv5`), so re-running the same
  file produces the same ids and does not duplicate.

---

## Privacy

A VCF is genomic data about an identifiable person.

**Nothing from the file reaches a diagnostic string.** Not a chromosome, position,
allele, INFO or FORMAT key, sample name, or header description. Every issue is a
fixed English sentence plus a count of how many times it happened; counts are
aggregate telemetry and cannot identify anyone. This is asserted by construction in
`src/tests/privacy.unit.test.ts`, which runs a VCF whose every field is a distinctive
token through the paths that produce every reportable kind and then searches the
resulting `OperationOutcome` for each token.

`ConnectorError` from `@open-twin/fhir-core` is used for the failures that do throw,
and carries no payload — including in `cause`.

---

## Verification

- `npx tsc --noEmit` — clean, strict, with `noUncheckedIndexedAccess`.
- `npx vitest run` — 108 tests, nothing skipped.
- `pnpm lint` (`biome ci`) — clean.
- The bundle registered in `verify/bundles.manifest.ts` as `genomics-vcf-hiseq` is
  built by running this connector over the committed HiSeq fixture and passes the HL7
  validator with **zero errors**, against both `verify/conformance/generated` and the
  real `hl7.fhir.uv.genomics-reporting#3.0.0` package — the validator resolves the
  profile named in `meta.profile` and enforces it.

`verify/check-terminology.mjs` now sees all 49 LOINC codes and answer codes this
package uses (they are written as literal objects precisely so that it can). They are
reported as **unreviewed** until someone with clinical terminology authority records
a sign-off in `verify/terminology-allowlist.json` — a file this package may not edit.
The lookups are done and recorded in `src/fhir/terminology.ts`; what is missing is
the human signature, which is the whole point of that gate.

The only remaining validator output is a warning that
`http://www.ncbi.nlm.nih.gov/projects/SNP` cannot be resolved, which is expected: it
is the dbSNP URI registered by the FHIR R4 specification, and no terminology server
in the run supplies it.

Fixture provenance, including exactly what was removed from each file and why, is in
`src/tests/fixtures/PROVENANCE.md`.

[ig]: http://hl7.org/fhir/uv/genomics-reporting/
