import { assemblyCoding, type LoincCoding } from '../fhir/terminology';
import type { IssueLog } from '../issues';
import type { VcfHeader } from './types';

export interface DetectedBuild {
  coding?: LoincCoding;
}

/**
 * A `##reference` value that is a path or URI is ignored.
 *
 * Real headers carry `##reference=file:///humgen/gsa-hpprojects/GATK/bundle/current/
 * b37/human_g1k_v37.fasta`. Two reasons not to read it: it is an absolute path into
 * the producing institution's filesystem and has no business in a clinical resource,
 * and inferring a build from a FASTA filename is the kind of guess this connector
 * exists not to make. The same file also carries `##reference=GRCh37.3`, which says
 * the build outright.
 */
function isPathLike(value: string): boolean {
  return value.includes('/') || value.includes('\\') || value.includes(':');
}

/**
 * The reference genome build, taken from the header and never assumed.
 *
 * Candidates are the non-path `##reference` values and every `##contig` `assembly`
 * attribute. If they map to more than one distinct assembly the result is nothing
 * plus a conflict issue: a file that cannot say which genome it is against must not
 * be published as though it could.
 */
export function detectGenomeBuild(header: VcfHeader, issues: IssueLog): DetectedBuild {
  const candidates: string[] = [];
  for (const value of header.reference) {
    if (value !== '' && !isPathLike(value)) candidates.push(value);
  }
  for (const contig of header.contigs.values()) {
    if (contig.assembly) candidates.push(contig.assembly);
  }

  if (candidates.length === 0) {
    issues.add('reference-build-absent');
    return {};
  }

  const resolved = new Map<string, LoincCoding>();
  let unmatched = 0;
  for (const candidate of candidates) {
    const coding = assemblyCoding(candidate);
    if (coding) resolved.set(coding.code, coding);
    else unmatched++;
  }

  if (resolved.size > 1) {
    issues.add('reference-build-conflict');
    return {};
  }
  if (resolved.size === 0) {
    issues.add('reference-build-unrecognised', unmatched);
    return {};
  }
  const [coding] = resolved.values();
  return { coding };
}

/**
 * `##fileDate` as a FHIR `date`, or undefined.
 *
 * VCF does not fix the format of this line. `YYYYMMDD` is what every implementation
 * in practice writes and what the specification's own examples show; `YYYY-MM-DD` is
 * accepted because it is already the target format. Anything else is not guessed at.
 */
export function fileDateToFhirDate(fileDate: string | undefined): string | undefined {
  if (!fileDate) return undefined;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(fileDate.trim());
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(fileDate.trim()) ? fileDate.trim() : undefined;
}
