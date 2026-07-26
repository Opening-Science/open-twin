# Fixture provenance

Both fixtures are verbatim excerpts of public test data. Nothing was edited inside a
line: lines were kept or dropped whole, so every header declaration and every data
line is byte-identical to the source. That matters — a fixture that has been tidied
up stops being an oracle.

## `hiseq-na12878.trimmed.vcf`

| | |
|---|---|
| Source | `https://raw.githubusercontent.com/samtools/htsjdk/master/src/test/resources/htsjdk/variant/HiSeq.10000.vcf` |
| Repository | samtools/htsjdk, `src/test/resources/htsjdk/variant/` |
| Retrieved | 2026-07-26 |
| Sample | NA12878 — a publicly distributed, consented CEPH/HapMap cell line (GIAB reference material), not a patient record |

Kept: the entire header except the two `##UnifiedGenotyper=` and `##VariantFiltration=`
lines, which are multi-kilobyte GATK command lines containing absolute paths into the
Broad Institute's filesystem. They are unstructured `##key=value` metadata that this
connector ignores, and there is no reason to redistribute somebody's directory layout.

Kept: 11 of the 10 000 data lines, chosen to include PASS records, records excluded by
FILTER, records with and without an rsID, and both `0/1` and `1/1` genotypes.

What this file demonstrates, and why it was chosen over a tidier one:

- `##fileformat=VCFv4.0`, older than the 4.2/4.3 this connector targets;
- **no `##reference` and no `##contig`**, so the reference genome build is genuinely
  absent and the connector must report that rather than infer `hg18` from the
  `reference_sequence=` argument buried in the GATK command line;
- a trailing tab on the `#CHROM` line, which naive column counting reads as a second,
  nameless sample.

## `dbsnp-135-b37.trimmed.vcf`

| | |
|---|---|
| Source | `https://raw.githubusercontent.com/samtools/htsjdk/master/src/test/resources/htsjdk/variant/dbsnp_135.b37.1000.vcf` |
| Repository | samtools/htsjdk, `src/test/resources/htsjdk/variant/` |
| Retrieved | 2026-07-26 |
| Content | dbSNP build 135, sites only. A public variant database, not an individual's genome |

Kept: the header except the `##LeftAlignVariants=` GATK command line and all but the
first two `##contig` lines. Kept: 10 of the 1000 data lines.

What this file demonstrates:

- `##reference=GRCh37.3` alongside `##reference=file:///.../human_g1k_v37.fasta`, so
  build detection has to prefer the build name and ignore the path;
- `##contig=<ID=1,length=249250621,assembly=b37>` agreeing with it;
- multi-allelic sites (`CTA -> C,CA`) and indels with a VCF padding base;
- no sample columns at all, which is the case where the connector refuses to invent a
  subject;
- `##INFO=<ID=G5,...,Description=">5% minor allele frequency in 1+ populations">` — a
  `>` inside a quoted description, which breaks any header parser that looks for the
  last `>` on the line.
