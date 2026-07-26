import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IssueLog } from '../issues';
import { parseHeader } from '../vcf/header';
import { parseRecords } from '../vcf/records';
import type { VcfHeader, VcfRecord } from '../vcf/types';

const HERE = dirname(fileURLToPath(import.meta.url));

export const FIXTURES = {
  hiseq: join(HERE, 'fixtures', 'hiseq-na12878.trimmed.vcf'),
  dbsnp: join(HERE, 'fixtures', 'dbsnp-135-b37.trimmed.vcf')
} as const;

export function readFixture(name: keyof typeof FIXTURES): string {
  return readFileSync(FIXTURES[name], 'utf8');
}

export interface ParsedVcf {
  header: VcfHeader;
  records: VcfRecord[];
  issues: IssueLog;
}

/** Parses a whole VCF given as lines, so tests can be written as the file itself. */
export function parseVcf(lines: string[]): ParsedVcf {
  const issues = new IssueLog();
  const { header, chromLineIndex } = parseHeader(lines, issues);
  const records = parseRecords(lines, chromLineIndex + 1, header, issues);
  return { header, records, issues };
}

export const CHROM_LINE_SINGLE_SAMPLE = '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1';
export const CHROM_LINE_SITES_ONLY = '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO';
