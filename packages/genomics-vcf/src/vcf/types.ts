/**
 * WHAT: Parses VCF structures (header, records, genotype, coordinates).
 * NOT:  Must not emit FHIR resources; fhir/ owns mapping.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: VCF specification parsing; fixtures from public htsjdk/dbSNP where applicable.
 */
/**
 * The `Number` attribute of an INFO or FORMAT declaration (hts-specs §1.4.2).
 *
 * `A` is one value per ALT allele, `R` one per allele including REF, `G` one per
 * genotype. `unbounded` is the spec's `.`: the number of values varies, is unknown,
 * or is unbounded. These are declared per file and must be honoured rather than
 * inferred from how many commas a particular value happens to contain — the same
 * key means different things in different files.
 */
export type VcfNumber = number | 'A' | 'R' | 'G' | 'unbounded';

export type VcfValueType = 'Integer' | 'Float' | 'Flag' | 'Character' | 'String';

export interface VcfFieldDeclaration {
  id: string;
  number: VcfNumber;
  type: VcfValueType;
}

export interface VcfContig {
  id: string;
  length?: number;
  assembly?: string;
}

export interface VcfHeader {
  /** The raw `##fileformat` value, e.g. `VCFv4.2`. Undefined when the line is absent. */
  fileformat?: string;
  info: Map<string, VcfFieldDeclaration>;
  format: Map<string, VcfFieldDeclaration>;
  contigs: Map<string, VcfContig>;
  /** Every `##reference` value, in file order. May be a build name or a file URI. */
  reference: string[];
  /** `##fileDate`, verbatim. VCF does not fix its format. */
  fileDate?: string;
  /** Sample column names from the `#CHROM` line, in order. Empty for a sites-only VCF. */
  samples: string[];
}

/**
 * A single element of an INFO or FORMAT value. `null` is the spec's `.`: this
 * element is missing. It is never coerced to 0 — an allelic read depth of "missing"
 * and an allelic read depth of 0 are different clinical statements.
 */
export type VcfScalar = string | number | boolean | null;

export interface VcfRecord {
  /** Zero-based index among the data lines, for correlating with the source file. */
  index: number;
  chrom: string;
  /** 1-based, inclusive: the position of the first base of REF (hts-specs §1.4.1). */
  pos: number;
  /** The ID column split on `;`. Empty when the column is `.`. */
  ids: string[];
  ref: string;
  /** The ALT column split on `,`. Empty when the column is `.`. */
  alts: string[];
  qual: number | null;
  /**
   * The FILTER column split on `;`. Empty when the column is `.` (not filtered on).
   * `['PASS']` when all filters passed.
   */
  filters: string[];
  info: Map<string, VcfScalar[]>;
  /** Per-sample FORMAT values, keyed by sample name then FORMAT key. */
  samples: Map<string, Map<string, VcfScalar[]>>;
}

/** A parsed GT value (hts-specs §1.4.2, the GT genotype field). */
export interface VcfGenotype {
  /** Allele indices; `null` for the spec's `.` (no call). 0 is REF, 1 the first ALT. */
  alleles: (number | null)[];
  /** True when every separator was `|`. Phase is parsed but not carried into FHIR. */
  phased: boolean;
}
