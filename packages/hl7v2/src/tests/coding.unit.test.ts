import { SYSTEMS } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import { obxToObservation } from '../fhir/observation';
import { IssueLog } from '../issues';
import { codingFrom, cweToCodeableConcept, type DatatypeContext } from '../v2/datatypes';
import { findSegments, parseMessage } from '../v2/parser';
import { HL7V2_LOCAL_SYSTEM, resolveCodingSystem } from '../v2/tables';
import { MDM_T02_HEADER, MDM_T02_OBX, message, ORU_R01 } from './fixtures/messages';

/**
 * OBX-3 is where an HL7 v2 connector is right or wrong.
 *
 * A LOINC code under `http://loinc.org` carries LOINC's definition of the concept,
 * which every FHIR consumer will apply. The same digits from a laboratory's own
 * dictionary carry the laboratory's definition and nobody else's. Publishing the
 * second as the first hands the receiver a concept the sender never asserted, and
 * nothing downstream can detect it: the resource is structurally perfect.
 *
 * The distinguishing fact is CWE.3, the name of the coding system. HL7 table 0396
 * defines `LN` as LOINC. It defines `99zzz` as "Local general code where z is an
 * alphanumeric character". `L` and an absent CWE.3 are not LOINC either.
 */

const parseOne = (raw: string) => {
  const parsed = parseMessage(raw);
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.message;
};

describe('resolveCodingSystem', () => {
  it('recognises LN as LOINC', () => {
    expect(resolveCodingSystem('LN', HL7V2_LOCAL_SYSTEM)).toEqual({
      system: SYSTEMS.LOINC,
      recognised: true
    });
  });

  it('does not treat any other coding system name as LOINC', () => {
    for (const name of ['L', '99ROCHE', 'LOINC', 'LNC', 'GDT', '99zzz']) {
      expect(resolveCodingSystem(name, HL7V2_LOCAL_SYSTEM).system).not.toBe(SYSTEMS.LOINC);
    }
  });

  it('does not treat an absent coding system as LOINC', () => {
    expect(resolveCodingSystem(undefined, HL7V2_LOCAL_SYSTEM)).toEqual({
      system: HL7V2_LOCAL_SYSTEM,
      recognised: false
    });
  });

  it('recognises SCT as SNOMED CT but not SNM or SNM3', () => {
    // Table 0396 defines SNM as SNOMED 2nd edition and SNM3 as SNOMED International
    // 1993. They are different code systems with different identifiers; mapping them
    // onto http://snomed.info/sct publishes a code that does not exist there.
    expect(resolveCodingSystem('SCT', HL7V2_LOCAL_SYSTEM).system).toBe(SYSTEMS.SNOMED);
    expect(resolveCodingSystem('SNM', HL7V2_LOCAL_SYSTEM).system).toBe(HL7V2_LOCAL_SYSTEM);
    expect(resolveCodingSystem('SNM3', HL7V2_LOCAL_SYSTEM).system).toBe(HL7V2_LOCAL_SYSTEM);
  });

  it('resolves HL7-defined v2 tables to their published code systems', () => {
    expect(resolveCodingSystem('HL70078', HL7V2_LOCAL_SYSTEM).system).toBe(
      'http://terminology.hl7.org/CodeSystem/v2-0078'
    );
  });

  it('honours a caller-supplied local system', () => {
    const perSender = 'http://example.org/fhir/CodeSystem/lab-a';
    expect(resolveCodingSystem('99LAB', perSender).system).toBe(perSender);
  });
});

describe('OBX-3 in the IG example messages', () => {
  const context = (raw: string): { context: DatatypeContext; segments: ReturnType<typeof findSegments> } => {
    const parsed = parseOne(raw);
    return {
      context: { encoding: parsed.encoding, localCodeSystem: HL7V2_LOCAL_SYSTEM },
      segments: findSegments(parsed, 'OBX')
    };
  };

  it("publishes an LN-declared code under http://loinc.org, without the sender's wording as its display", () => {
    // IG ORU_R01 example, OBX|1: `6153-1^IgE Blue Grass Kentucky^LN`.
    //
    // The code is LOINC's; the wording is not. LOINC calls 6153-1 'Kentucky blue
    // grass IgE Ab [Units/volume] in Serum', and asserting the sender's phrasing as
    // Coding.display claims a name the system does not use — which the HL7
    // validator reports as an error. The wording is preserved as text instead.
    const { context: ctx, segments } = context(ORU_R01);
    const result = cweToCodeableConcept(segments[0]?.fields[2]?.[0], ctx);
    expect(result?.codings).toEqual([{ system: SYSTEMS.LOINC, code: '6153-1' }]);
    expect(result?.concept.text).toBe('IgE Blue Grass Kentucky');
  });

  it('publishes a code with no coding system under the local system, not LOINC', () => {
    // IG MDM_T02 example, OBX|1: `85202^Transcription Authentication Interface
    // Message Text` — an identifier and a display, and no coding system at all.
    const { context: ctx, segments } = context(message(MDM_T02_HEADER, MDM_T02_OBX[0] as string));
    const result = cweToCodeableConcept(segments[0]?.fields[2]?.[0], ctx);
    expect(result?.codings[0]?.code).toBe('85202');
    expect(result?.codings[0]?.system).toBe(HL7V2_LOCAL_SYSTEM);
    expect(codingFrom(result, SYSTEMS.LOINC)).toBeUndefined();
  });

  it('keeps a local primary code local and the LOINC alternate LOINC', () => {
    // IG MDM_T02 example, OBX|4: `1111.2^PHQ-9 Depression Screen PDF^L^44249-1^PHQ-9
    // quick depression assessment panel [Reported.PHQ]^LN`. Both codes describe the
    // same observation; only one of them is LOINC.
    const { context: ctx, segments } = context(message(MDM_T02_HEADER, MDM_T02_OBX[2] as string));
    const result = cweToCodeableConcept(segments[0]?.fields[2]?.[0], ctx);

    expect(result?.codings).toHaveLength(2);
    // The sender defines their own local code system, so their display for a local
    // code IS authoritative and is kept. Only a standard system's display is not
    // theirs to assert.
    expect(result?.codings[0]).toEqual({
      system: HL7V2_LOCAL_SYSTEM,
      code: '1111.2',
      display: 'PHQ-9 Depression Screen PDF'
    });
    expect(result?.codings[1]).toEqual({
      system: SYSTEMS.LOINC,
      code: '44249-1'
    });
    expect(codingFrom(result, SYSTEMS.LOINC)?.code).toBe('44249-1');
  });

  it('does not drop the alternate coding, which would lose the only LOINC code present', () => {
    const { context: ctx, segments } = context(message(MDM_T02_HEADER, MDM_T02_OBX[2] as string));
    const result = cweToCodeableConcept(segments[0]?.fields[2]?.[0], ctx);
    expect(codingFrom(result, SYSTEMS.LOINC)).toBeDefined();
  });
});

describe('the LOINC code drives the unit policy, and a local code must not', () => {
  const convert = (obx: string) => {
    const parsed = parseOne(message(MDM_T02_HEADER, obx));
    const segment = findSegments(parsed, 'OBX')[0];
    if (!segment) throw new Error('no OBX segment');
    return obxToObservation(
      segment,
      [],
      {
        datatypes: { encoding: parsed.encoding, localCodeSystem: HL7V2_LOCAL_SYSTEM },
        connector: 'hl7v2',
        subjectKey: 'subject',
        messageControlId: 'control',
        subject: { reference: 'urn:uuid:00000000-0000-5000-8000-000000000000' }
      },
      new IssueLog()
    );
  };

  /**
   * `8302-2` is LOINC body height, whose canonical unit in `@open-twin/fhir-core`
   * is `cm` (D4). Sent as metres under the LOINC code, the value is converted.
   *
   * The same digits sent under a *local* coding system are a different concept, so
   * no conversion may happen: 1.9 of whatever that laboratory calls 8302-2 is 1.9.
   * A mapper that keys the unit policy on the digits rather than on the system
   * rescales an unrelated measurement by a factor of a hundred.
   */
  it('converts metres to the canonical centimetres when OBX-3 says LN', () => {
    const observation = convert('OBX|1|NM|8302-2^Body Height^LN||1.9|m^meter^UCUM|||||F|');
    expect(observation.valueQuantity).toEqual({
      value: 190,
      unit: 'centimeters',
      system: SYSTEMS.UCUM,
      code: 'cm'
    });
  });

  it('leaves the value alone when the same digits arrive under a local coding system', () => {
    const observation = convert('OBX|1|NM|8302-2^Body Height^L||1.9|m^meter^UCUM|||||F|');
    expect(observation.code.coding?.[0]?.system).toBe(HL7V2_LOCAL_SYSTEM);
    expect(observation.valueQuantity).toEqual({
      value: 1.9,
      unit: 'meter',
      system: SYSTEMS.UCUM,
      code: 'm'
    });
  });
});
