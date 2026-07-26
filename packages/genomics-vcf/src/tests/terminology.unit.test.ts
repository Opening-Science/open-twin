import { SYSTEMS } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import {
  ALLELIC_STATE_ANSWER,
  assemblyCoding,
  COMPONENT,
  COORDINATE_SYSTEM_ANSWER,
  chromosomeCoding,
  VARIANT_ASSESSMENT,
  VARIANT_PRESENCE
} from '../fhir/terminology';

/**
 * These pin every code to the value that was looked up, so that changing one becomes
 * a failing test rather than a silent edit. Each expected value here was read from
 * `tx.fhir.org` (LOINC 2.82) on 2026-07-26 — not from the source file it is checking.
 *
 * A wrong LOINC code is the defect this repository is being remediated for, and it is
 * invisible: `LA14029-2` for GRCh37 looks exactly as plausible as `LA14029-5`.
 */
describe('LOINC concepts', () => {
  it('uses the Variant profile observation code', () => {
    expect(VARIANT_ASSESSMENT).toEqual({
      system: SYSTEMS.LOINC,
      code: '69548-6',
      display: 'Genetic variant assessment'
    });
  });

  it('uses the component codes the profile fixes', () => {
    expect(COMPONENT.REF_ALLELE.code).toBe('69547-8');
    expect(COMPONENT.ALT_ALLELE.code).toBe('69551-0');
    expect(COMPONENT.EXACT_START_END.code).toBe('81254-5');
    expect(COMPONENT.COORDINATE_SYSTEM.code).toBe('92822-6');
    expect(COMPONENT.ALLELIC_STATE.code).toBe('53034-5');
    expect(COMPONENT.ALLELIC_READ_DEPTH.code).toBe('82121-5');
    expect(COMPONENT.SAMPLE_ALLELIC_FREQUENCY.code).toBe('81258-6');
    expect(COMPONENT.VARIATION_CODE.code).toBe('81252-9');
    expect(COMPONENT.REFERENCE_SEQUENCE_ASSEMBLY.code).toBe('62374-4');
    expect(COMPONENT.CHROMOSOME_IDENTIFIER.code).toBe('48000-4');
  });

  it('puts every code in LOINC and gives none of them an invented display', () => {
    for (const coding of Object.values(COMPONENT)) {
      expect(coding.system).toBe(SYSTEMS.LOINC);
      expect(coding.display).not.toBe('');
    }
  });

  it('uses the answer codes for coordinate system, presence and allelic state', () => {
    expect(COORDINATE_SYSTEM_ANSWER.ONE_BASED_CHARACTER.code).toBe('LA30102-0');
    expect(COORDINATE_SYSTEM_ANSWER.ZERO_BASED_INTERBASE.code).toBe('LA30100-4');
    expect(VARIANT_PRESENCE.PRESENT.code).toBe('LA9633-4');
    expect(VARIANT_PRESENCE.ABSENT.code).toBe('LA9634-2');
    expect(VARIANT_PRESENCE.NO_CALL.code).toBe('LA18198-4');
    expect(VARIANT_PRESENCE.INDETERMINATE.code).toBe('LA11884-6');
    expect(ALLELIC_STATE_ANSWER.HOMOZYGOUS.code).toBe('LA6705-3');
    expect(ALLELIC_STATE_ANSWER.HETEROZYGOUS.code).toBe('LA6706-1');
    expect(ALLELIC_STATE_ANSWER.HEMIZYGOUS.code).toBe('LA6707-9');
  });
});

describe('chromosome identifiers (LL2938-0)', () => {
  it('maps the ends and the middle of the autosome range', () => {
    expect(chromosomeCoding('1')?.code).toBe('LA21254-0');
    expect(chromosomeCoding('11')?.code).toBe('LA21264-9');
    expect(chromosomeCoding('22')?.code).toBe('LA21275-5');
    expect(chromosomeCoding('X')?.code).toBe('LA21276-3');
    expect(chromosomeCoding('Y')?.code).toBe('LA21277-1');
  });

  it('accepts both the chr-prefixed and bare naming conventions', () => {
    expect(chromosomeCoding('chr7')).toEqual(chromosomeCoding('7'));
    expect(chromosomeCoding('chrX')).toEqual(chromosomeCoding('X'));
  });

  it('gives 24 distinct codes, so a copy-paste in the table shows up', () => {
    const codes = new Set<string>();
    for (const name of [...Array.from({ length: 22 }, (_, index) => String(index + 1)), 'X', 'Y']) {
      const coding = chromosomeCoding(name);
      expect(coding?.display).toBe(`Chromosome ${name}`);
      if (coding) codes.add(coding.code);
    }
    expect(codes.size).toBe(24);
  });

  it('has nothing for the mitochondrion or an alt contig, rather than an invented code', () => {
    // LL2938-0 contains chromosomes 1-22, X and Y only.
    expect(chromosomeCoding('MT')).toBeUndefined();
    expect(chromosomeCoding('chrM')).toBeUndefined();
    expect(chromosomeCoding('GL000207.1')).toBeUndefined();
    expect(chromosomeCoding('23')).toBeUndefined();
  });
});

describe('reference assembly (LL1040-6)', () => {
  it('maps the GRC names', () => {
    expect(assemblyCoding('GRCh38')?.code).toBe('LA26806-2');
    expect(assemblyCoding('GRCh37')?.code).toBe('LA14029-5');
    expect(assemblyCoding('GRCh37.3')?.code).toBe('LA14029-5');
    expect(assemblyCoding('NCBI36')?.code).toBe('LA14030-3');
  });

  it('maps the UCSC and 1000 Genomes aliases the same way', () => {
    expect(assemblyCoding('hg38')?.code).toBe('LA26806-2');
    expect(assemblyCoding('hg19')?.code).toBe('LA14029-5');
    expect(assemblyCoding('b37')?.code).toBe('LA14029-5');
    expect(assemblyCoding('human_g1k_v37')?.code).toBe('LA14029-5');
    expect(assemblyCoding('hg18')?.code).toBe('LA14030-3');
  });

  it('returns nothing for a build it does not recognise', () => {
    expect(assemblyCoding('T2T-CHM13v2.0')).toBeUndefined();
    expect(assemblyCoding('')).toBeUndefined();
    expect(assemblyCoding('some-internal-reference')).toBeUndefined();
  });

  it('does not confuse GRCh37 with GRCh38', () => {
    expect(assemblyCoding('GRCh37')?.code).not.toBe(assemblyCoding('GRCh38')?.code);
  });
});
