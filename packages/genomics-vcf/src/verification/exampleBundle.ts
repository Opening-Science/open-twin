/**
 * WHAT: Builds a fixture Bundle used by emit-bundles / local verification.
 * NOT:  Must not be treated as production PHI; must not skip validator assumptions.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: HL7 validator (CI fhir-validate); Oura sandbox path additionally uses recorded vendor sandbox responses where applicable.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bundle } from 'fhir/r4';
import { vcfToFhirBundle } from '../fhir/bundleBuilder';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The trimmed, committed excerpt of a real public VCF. See fixtures/PROVENANCE.md. */
export const HISEQ_FIXTURE = join(HERE, '..', 'tests', 'fixtures', 'hiseq-na12878.trimmed.vcf');

/**
 * The bundle handed to the HL7 validator in CI.
 *
 * Built by running the connector over a real VCF, not by hand: a hand-written
 * literal validates whatever it was written to contain, which is the same mistake as
 * a snapshot test asserting its own output.
 *
 * The file it is built from has no `##reference` and no `##contig`, so the emitted
 * Observations carry no reference sequence assembly component and the result reports
 * `reference-build-absent`. That is the honest outcome for that file, and it is the
 * one the validator sees.
 */
export function genomicsVcfBundle(): Bundle {
  const vcf = readFileSync(HISEQ_FIXTURE, 'utf8');
  return vcfToFhirBundle(vcf, { timestamp: '2026-07-26T10:00:00Z', effectiveDateTime: '2026-07-26' }).bundle;
}
