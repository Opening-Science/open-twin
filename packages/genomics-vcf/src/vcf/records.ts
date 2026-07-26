import type { IssueLog } from '../issues';
import type { VcfFieldDeclaration, VcfGenotype, VcfHeader, VcfNumber, VcfRecord, VcfScalar } from './types';

const MISSING = '.';
const REF_ALLELE = /^[ACGTNacgtn]+$/;

/**
 * How many values a declaration requires, given the number of ALT alleles on this
 * line and (for FORMAT) the ploidy of the call.
 *
 * Returns undefined when the count is genuinely not fixed — `Number=.`, or `Number=G`
 * with no genotype to read the ploidy from. Guessing there would manufacture a
 * mismatch out of a perfectly valid file.
 */
export function expectedValueCount(number: VcfNumber, altCount: number, ploidy?: number): number | undefined {
  if (number === 'unbounded') return undefined;
  if (number === 'A') return altCount;
  if (number === 'R') return altCount + 1;
  if (number === 'G') return ploidy === undefined ? undefined : genotypeCount(altCount + 1, ploidy);
  return number;
}

/**
 * The number of unordered genotypes over `alleleCount` alleles at a given ploidy —
 * a multiset coefficient, C(alleleCount + ploidy - 1, ploidy). For the ordinary
 * diploid biallelic case that is 3 (AA, AB, BB), which is what GL/PL declare.
 */
function genotypeCount(alleleCount: number, ploidy: number): number {
  let result = 1;
  for (let step = 1; step <= ploidy; step++) {
    result = (result * (alleleCount + step - 1)) / step;
  }
  return Math.round(result);
}

function toTypedValue(raw: string, type: VcfFieldDeclaration['type']): VcfScalar | undefined {
  if (raw === MISSING) return null;
  switch (type) {
    case 'Flag':
      return true;
    case 'Integer': {
      if (!/^[+-]?\d+$/.test(raw)) return undefined;
      return Number(raw);
    }
    case 'Float': {
      // hts-specs §1.3 permits Inf, -Inf and NaN for Float. They are parsed rather
      // than rejected, and `quantity()` in @open-twin/fhir-core refuses to emit a
      // non-finite value, so they can never reach a FHIR Quantity.
      const normalised = raw.toLowerCase();
      if (normalised === 'inf' || normalised === '+inf' || normalised === 'infinity') return Number.POSITIVE_INFINITY;
      if (normalised === '-inf' || normalised === '-infinity') return Number.NEGATIVE_INFINITY;
      if (normalised === 'nan') return Number.NaN;
      const parsed = Number(raw);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    case 'Character':
      return raw.length === 1 ? raw : undefined;
    case 'String':
      return raw;
  }
}

function typedValues(
  raw: string,
  declaration: VcfFieldDeclaration,
  issues: IssueLog,
  untypableKind: 'info-value-untypable' | 'format-value-untypable'
): VcfScalar[] {
  return raw.split(',').map((element) => {
    const value = toTypedValue(element, declaration.type);
    if (value === undefined) {
      issues.add(untypableKind);
      return null;
    }
    return value;
  });
}

/**
 * INFO, honouring the header's declared Type and Number.
 *
 * A key the header does not declare is kept as a string and flagged. It is never
 * guessed at from its shape: `AF=0.5` is a Float in one file and, in a file that
 * declares `Number=A`, an array whose single element happens to look scalar.
 */
export function parseInfo(
  raw: string,
  header: VcfHeader,
  altCount: number,
  issues: IssueLog
): Map<string, VcfScalar[]> {
  const info = new Map<string, VcfScalar[]>();
  if (raw === MISSING || raw === '') return info;

  for (const entry of raw.split(';')) {
    if (entry === '') continue;
    const separator = entry.indexOf('=');
    const key = separator < 0 ? entry : entry.slice(0, separator);
    const value = separator < 0 ? undefined : entry.slice(separator + 1);

    const declaration = header.info.get(key);
    if (!declaration) {
      issues.add('info-field-undeclared');
      info.set(key, value === undefined ? [true] : value.split(','));
      continue;
    }

    if (declaration.type === 'Flag') {
      info.set(key, [true]);
      continue;
    }
    if (value === undefined) {
      issues.add('info-value-untypable');
      info.set(key, [null]);
      continue;
    }

    const values = typedValues(value, declaration, issues, 'info-value-untypable');
    const expected = expectedValueCount(declaration.number, altCount);
    if (expected !== undefined && values.length !== expected) issues.add('info-cardinality-mismatch');
    info.set(key, values);
  }

  return info;
}

/** GT, per hts-specs §1.4.2. Returns undefined when the value is not a genotype. */
export function parseGenotype(raw: string): VcfGenotype | undefined {
  if (raw === '' || raw === MISSING) return { alleles: [null], phased: false };
  const alleles: (number | null)[] = [];
  for (const token of raw.split(/[|/]/)) {
    if (token === MISSING) {
      alleles.push(null);
      continue;
    }
    if (!/^\d+$/.test(token)) return undefined;
    alleles.push(Number(token));
  }
  // A haploid call has no separator and therefore nothing to phase; reporting it as
  // phased would be an assertion the file never made.
  return { alleles, phased: alleles.length > 1 && !raw.includes('/') };
}

function parseSampleColumn(
  column: string,
  formatKeys: string[],
  header: VcfHeader,
  altCount: number,
  issues: IssueLog
): Map<string, VcfScalar[]> {
  const values = new Map<string, VcfScalar[]>();
  const rawValues = column.split(':');

  // hts-specs §1.4.2: trailing FORMAT fields may be dropped from a sample column.
  // A key with no value is absent, which is not the same as a key whose value is `.`.
  const ploidy = ploidyOf(formatKeys, rawValues);

  for (let keyIndex = 0; keyIndex < formatKeys.length; keyIndex++) {
    const key = formatKeys[keyIndex];
    const raw = rawValues[keyIndex];
    if (key === undefined || raw === undefined) continue;

    if (key === 'GT') {
      values.set(key, [raw]);
      continue;
    }

    const declaration = header.format.get(key);
    if (!declaration) {
      issues.add('format-field-undeclared');
      values.set(key, raw.split(','));
      continue;
    }

    const parsed = typedValues(raw, declaration, issues, 'format-value-untypable');
    const expected = expectedValueCount(declaration.number, altCount, ploidy);
    if (expected !== undefined && parsed.length !== expected) issues.add('format-cardinality-mismatch');
    values.set(key, parsed);
  }

  return values;
}

function ploidyOf(formatKeys: string[], rawValues: string[]): number | undefined {
  const gtIndex = formatKeys.indexOf('GT');
  if (gtIndex < 0) return undefined;
  const raw = rawValues[gtIndex];
  if (raw === undefined) return undefined;
  return parseGenotype(raw)?.alleles.length;
}

/** Drops trailing empty columns. VCF has no empty field: a missing value is `.`. */
function columnsOf(line: string): string[] {
  const columns = line.split('\t');
  while (columns.length > 0 && columns[columns.length - 1] === '') columns.pop();
  return columns;
}

const CHROM_COLUMN = 0;
const POS_COLUMN = 1;
const ID_COLUMN = 2;
const REF_COLUMN = 3;
const ALT_COLUMN = 4;
const QUAL_COLUMN = 5;
const FILTER_COLUMN = 6;
const INFO_COLUMN = 7;
const FORMAT_COLUMN = 8;
const FIRST_SAMPLE_COLUMN = 9;

export function parseRecords(lines: string[], firstDataLine: number, header: VcfHeader, issues: IssueLog): VcfRecord[] {
  const records: VcfRecord[] = [];

  for (let lineIndex = firstDataLine; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (line === undefined || line === '' || line.startsWith('#')) continue;

    const columns = columnsOf(line);
    const chrom = columns[CHROM_COLUMN];
    const posRaw = columns[POS_COLUMN];
    const refRaw = columns[REF_COLUMN];
    const altRaw = columns[ALT_COLUMN];
    const infoRaw = columns[INFO_COLUMN];
    if (
      chrom === undefined ||
      posRaw === undefined ||
      refRaw === undefined ||
      altRaw === undefined ||
      infoRaw === undefined
    ) {
      issues.add('record-malformed');
      continue;
    }

    const pos = Number(posRaw);
    if (!Number.isInteger(pos) || pos < 1) {
      issues.add('record-position-invalid');
      continue;
    }
    if (!REF_ALLELE.test(refRaw)) {
      issues.add('record-ref-invalid');
      continue;
    }

    const alts = altRaw === MISSING ? [] : altRaw.split(',');
    const qualRaw = columns[QUAL_COLUMN];
    const filterRaw = columns[FILTER_COLUMN];
    const idRaw = columns[ID_COLUMN];

    const samples = new Map<string, Map<string, VcfScalar[]>>();
    const formatRaw = columns[FORMAT_COLUMN];
    if (formatRaw !== undefined && header.samples.length > 0) {
      const formatKeys = formatRaw.split(':');
      for (let sampleIndex = 0; sampleIndex < header.samples.length; sampleIndex++) {
        const name = header.samples[sampleIndex];
        const column = columns[FIRST_SAMPLE_COLUMN + sampleIndex];
        if (name === undefined || column === undefined) continue;
        samples.set(name, parseSampleColumn(column, formatKeys, header, alts.length, issues));
      }
    }

    records.push({
      index: records.length,
      chrom,
      pos,
      ids: idRaw === undefined || idRaw === MISSING ? [] : idRaw.split(';'),
      ref: refRaw.toUpperCase(),
      alts,
      qual: qualRaw === undefined || qualRaw === MISSING ? null : Number(qualRaw),
      filters: filterRaw === undefined || filterRaw === MISSING ? [] : filterRaw.split(';'),
      info: parseInfo(infoRaw, header, alts.length, issues),
      samples
    });
  }

  return records;
}
