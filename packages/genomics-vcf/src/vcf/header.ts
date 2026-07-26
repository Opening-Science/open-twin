import { z } from 'zod';
import type { IssueLog } from '../issues';
import type { VcfContig, VcfFieldDeclaration, VcfHeader, VcfNumber, VcfValueType } from './types';

/**
 * Splits the body of a structured header line into its key=value pairs.
 *
 * A naive `split(',')` is wrong and a naive `slice(1, -1)` is wrong. Real headers
 * contain both:
 *
 *   ##INFO=<ID=G5,Number=0,Type=Flag,Description=">5% minor allele frequency in 1+ populations">
 *   ##INFO=<ID=GMAF,Number=1,Type=Float,Description="Global Minor Allele Frequency [0, 0.5]; ...">
 *
 * — a `>` inside a quoted description, and a `,` inside a quoted description. Both
 * are taken verbatim from the dbSNP 135 header committed as a fixture. So the body
 * is scanned with a quote state, and `\"` / `\\` are unescaped (hts-specs §1.2:
 * quoted strings escape the double quote and the backslash).
 *
 * Returns undefined when the line is not `<...>`-shaped at all.
 */
export function parseStructuredBody(value: string): Map<string, string> | undefined {
  if (!value.startsWith('<')) return undefined;

  const fields = new Map<string, string>();
  let index = 1;
  let closed = false;

  while (index < value.length) {
    if (value[index] === '>') {
      closed = true;
      break;
    }

    let key = '';
    while (index < value.length && value[index] !== '=' && value[index] !== ',' && value[index] !== '>') {
      key += value[index];
      index++;
    }
    if (value[index] !== '=') return undefined;
    index++;

    let raw = '';
    if (value[index] === '"') {
      index++;
      while (index < value.length && value[index] !== '"') {
        if (value[index] === '\\' && index + 1 < value.length) {
          raw += value[index + 1];
          index += 2;
          continue;
        }
        raw += value[index];
        index++;
      }
      if (value[index] !== '"') return undefined;
      index++;
    } else {
      while (index < value.length && value[index] !== ',' && value[index] !== '>') {
        raw += value[index];
        index++;
      }
    }

    fields.set(key.trim(), raw);
    if (value[index] === ',') index++;
  }

  return closed ? fields : undefined;
}

/**
 * `Number` per hts-specs §1.4.2. An unparseable value yields undefined so the caller
 * can record it rather than silently pretending the field is unbounded — a wrong
 * cardinality is how a per-ALT array gets read as a single value.
 */
export function parseVcfNumber(raw: string): VcfNumber | undefined {
  if (raw === 'A' || raw === 'R' || raw === 'G') return raw;
  if (raw === '.') return 'unbounded';
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * The structured header declarations are the file's own schema, and everything the
 * record parser does about types and cardinality follows from them. Validating them
 * with a schema rather than by hand means a malformed declaration is rejected once,
 * at the boundary, instead of producing a plausible-looking wrong type downstream.
 *
 * The zod error object is deliberately discarded: it embeds the offending value, and
 * a Description string in a clinical VCF can contain anything the caller's pipeline
 * put there.
 */
const fieldDeclarationSchema = z.object({
  ID: z.string().min(1),
  Number: z.string().min(1),
  Type: z.enum(['Integer', 'Float', 'Flag', 'Character', 'String'])
});

const contigSchema = z.object({
  ID: z.string().min(1),
  length: z.string().optional(),
  assembly: z.string().optional()
});

function toDeclaration(fields: Map<string, string>): VcfFieldDeclaration | undefined {
  const parsed = fieldDeclarationSchema.safeParse(Object.fromEntries(fields));
  if (!parsed.success) return undefined;
  const number = parseVcfNumber(parsed.data.Number);
  if (number === undefined) return undefined;
  return { id: parsed.data.ID, number, type: parsed.data.Type as VcfValueType };
}

function toContig(fields: Map<string, string>): VcfContig | undefined {
  const parsed = contigSchema.safeParse(Object.fromEntries(fields));
  if (!parsed.success) return undefined;
  const length = parsed.data.length === undefined ? undefined : Number(parsed.data.length);
  return {
    id: parsed.data.ID,
    ...(length !== undefined && Number.isFinite(length) ? { length } : {}),
    ...(parsed.data.assembly ? { assembly: parsed.data.assembly } : {})
  };
}

/** VCF versions whose simple-variant grammar this connector was written against. */
const SUPPORTED_FILEFORMATS = new Set(['VCFv4.0', 'VCFv4.1', 'VCFv4.2', 'VCFv4.3']);

export interface ParsedHeader {
  header: VcfHeader;
  /** Index of the `#CHROM` line among `lines`, or -1 when it is absent. */
  chromLineIndex: number;
}

/**
 * Reads every `##` line and the `#CHROM` line.
 *
 * Unknown `##key=value` lines are ignored on purpose. Real files carry the whole
 * command line of the tool that produced them, including absolute paths into the
 * producing institution's filesystem; those are neither parsed nor carried into the
 * output.
 */
export function parseHeader(lines: string[], issues: IssueLog): ParsedHeader {
  const header: VcfHeader = {
    info: new Map(),
    format: new Map(),
    contigs: new Map(),
    reference: [],
    samples: []
  };
  let chromLineIndex = -1;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (line === undefined) continue;
    if (!line.startsWith('#')) break;

    if (line.startsWith('#CHROM')) {
      chromLineIndex = lineIndex;
      header.samples = sampleNames(line);
      break;
    }
    if (!line.startsWith('##')) continue;

    const separator = line.indexOf('=');
    if (separator < 0) continue;
    const key = line.slice(2, separator);
    const value = line.slice(separator + 1);

    switch (key) {
      case 'fileformat':
        header.fileformat = value;
        break;
      case 'fileDate':
        header.fileDate = value;
        break;
      case 'reference':
        header.reference.push(value);
        break;
      case 'INFO':
      case 'FORMAT': {
        const fields = parseStructuredBody(value);
        const declaration = fields && toDeclaration(fields);
        if (!declaration) {
          issues.add('header-declaration-invalid');
          break;
        }
        (key === 'INFO' ? header.info : header.format).set(declaration.id, declaration);
        break;
      }
      case 'contig': {
        const fields = parseStructuredBody(value);
        const contig = fields && toContig(fields);
        if (!contig) {
          issues.add('header-declaration-invalid');
          break;
        }
        header.contigs.set(contig.id, contig);
        break;
      }
      default:
        break;
    }
  }

  if (header.fileformat === undefined) issues.add('fileformat-missing');
  else if (!SUPPORTED_FILEFORMATS.has(header.fileformat)) issues.add('fileformat-out-of-scope');

  return { header, chromLineIndex };
}

/**
 * The nine fixed `#CHROM` columns, then one column per sample.
 *
 * Trailing empty columns are dropped: the HiSeq file committed as a fixture ends its
 * `#CHROM` line with a tab, and treating that as a tenth, nameless sample would make
 * the file look like a joint call.
 */
function sampleNames(chromLine: string): string[] {
  const columns = chromLine.split('\t');
  while (columns.length > 0 && columns[columns.length - 1] === '') columns.pop();
  return columns.length > 9 ? columns.slice(9) : [];
}
