import { SYSTEMS } from '@open-twin/fhir-core';
import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { obxToObservation } from '../fhir/observation';
import { IssueLog } from '../issues';
import { findSegments, parseMessage } from '../v2/parser';
import { HL7V2_LOCAL_SYSTEM } from '../v2/tables';
import { MDM_T02_HEADER, message } from './fixtures/messages';

interface Converted {
  readonly observation: Observation;
  readonly issues: IssueLog;
}

/**
 * Converts one OBX in isolation. The header is the IG's MDM_T02 header, used only to
 * declare the delimiters; every OBX below is stated inline so the value type under
 * test is visible in the test.
 */
function convert(obx: string, notes: string[] = []): Converted {
  const parsed = parseMessage(message(MDM_T02_HEADER, obx, ...notes));
  if (!parsed.ok) throw new Error('fixture failed to parse');
  const segment = findSegments(parsed.message, 'OBX')[0];
  if (!segment) throw new Error('no OBX segment');
  const issues = new IssueLog();
  const observation = obxToObservation(
    segment,
    findSegments(parsed.message, 'NTE'),
    {
      datatypes: { encoding: parsed.message.encoding, localCodeSystem: HL7V2_LOCAL_SYSTEM },
      connector: 'hl7v2',
      subjectKey: 'subject',
      messageControlId: 'control',
      subject: { reference: 'urn:uuid:00000000-0000-5000-8000-000000000000' }
    },
    issues
  );
  return { observation, issues };
}

const diagnostics = (issues: IssueLog) => issues.all.map((error) => error.toString()).join('\n');

describe('OBX-2 selects the value type', () => {
  it('NM becomes a valueQuantity', () => {
    const { observation } = convert('OBX|1|NM|6153-1^IgE Blue Grass Kentucky^LN|1|3.9|kU/L|||||F');
    expect(observation.valueQuantity).toEqual({
      value: 3.9,
      unit: 'kU/L',
      system: SYSTEMS.UCUM,
      code: 'kU/L'
    });
    expect(observation.valueString).toBeUndefined();
  });

  it('ST and TX become a valueString', () => {
    expect(convert('OBX|1|ST|X^Local^L||No growth after 48 hours||||||F').observation.valueString).toBe(
      'No growth after 48 hours'
    );
    expect(convert('OBX|1|TX|X^Local^L||Sample haemolysed||||||F').observation.valueString).toBe('Sample haemolysed');
  });

  it('CE and CWE become a valueCodeableConcept, not a string', () => {
    const { observation } = convert('OBX|1|CWE|664-3^Poikilocytosis^LN||260350009^Present^SCT||||||F');
    expect(observation.valueCodeableConcept).toEqual({
      coding: [{ system: SYSTEMS.SNOMED, code: '260350009', display: 'Present' }]
    });
    // A coded answer flattened to text is not machine-readable, which is the whole
    // reason the sender coded it.
    expect(observation.valueString).toBeUndefined();
  });

  it('DT and TS become a valueDateTime with the offset preserved', () => {
    expect(convert('OBX|1|DT|X^Local^L||20150601||||||F').observation.valueDateTime).toBe('2015-06-01');
    expect(convert('OBX|1|TS|X^Local^L||20150602100012+0100||||||F').observation.valueDateTime).toBe(
      '2015-06-02T10:00:12+01:00'
    );
    expect(convert('OBX|1|DTM|X^Local^L||20150602100012+0100||||||F').observation.valueDateTime).toBe(
      '2015-06-02T10:00:12+01:00'
    );
  });

  it('reports an unsupported value type instead of guessing at a value', () => {
    // SN is a structured numeric: `<0.10` is a *bound*, not the number 0.10, and
    // publishing it as 0.10 states a result the laboratory did not report.
    const { observation, issues } = convert('OBX|1|SN|6265-3^IgE Timothy Grass^LN|3|<^0.10|kU/L|||||F');
    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.valueString).toBeUndefined();
    expect(observation.dataAbsentReason?.coding?.[0]?.code).toBe('unknown');
    expect(issues.all).toHaveLength(1);
    expect(diagnostics(issues)).toContain('SN');
    expect(diagnostics(issues)).toContain('not supported');
  });

  it('reports an ED value rather than emitting the payload as a string', () => {
    const { observation, issues } = convert('OBX|1|ED|X^Local^L||App^AP^PDF^Base64^Zm9v||||||F');
    expect(observation.valueString).toBeUndefined();
    expect(issues.all).toHaveLength(1);
  });

  it('does not name a value type that is not in HL7 table 0125', () => {
    // Anything outside the closed vocabulary is free text from a patient's record.
    const { issues } = convert('OBX|1|WIDGET|X^Local^L||whatever||||||F');
    expect(diagnostics(issues)).not.toContain('WIDGET');
    expect(diagnostics(issues)).toContain('not in HL7 table 0125');
  });
});

describe('OBX-6 units', () => {
  it('accepts a UCUM expression the sender declared', () => {
    const { observation, issues } = convert('OBX|1|NM|X^Local^L||190|cm^centimeter^UCUM|||||F');
    expect(observation.valueQuantity?.code).toBe('cm');
    // The display is the sender's word for the unit; the code is the UCUM symbol.
    // `centimeter` is not a UCUM symbol even though it reads like one.
    expect(observation.valueQuantity?.unit).toBe('centimeter');
    expect(issues.all).toHaveLength(0);
  });

  it('refuses a unit that is not valid UCUM instead of passing it through', () => {
    const { observation, issues } = convert('OBX|1|NM|X^Local^L||190|centimeter^centimeter^UCUM|||||F');
    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.dataAbsentReason?.coding?.[0]?.code).toBe('error');
    expect(diagnostics(issues)).toContain('UCUM');
  });

  it('refuses a unit whose dimension disagrees with the code it sits under', () => {
    // LOINC 8302-2 is a body height. A height in kilograms is not a unit problem to
    // be converted away; it is a message that contradicts itself.
    const { observation, issues } = convert('OBX|1|NM|8302-2^Body Height^LN||80|kg^kilogram^UCUM|||||F');
    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.dataAbsentReason?.coding?.[0]?.code).toBe('error');
    expect(diagnostics(issues)).toContain('commensurable');
  });

  it('takes the UCUM code from the alternate triplet when the primary is not UCUM', () => {
    const { observation } = convert('OBX|1|NM|X^Local^L||7.4|mgdl^mg per decilitre^99LOCAL^mg/dL^^UCUM|||||F');
    expect(observation.valueQuantity?.code).toBe('mg/dL');
  });

  it('keeps the number but reports that no unit was stated', () => {
    const { observation, issues } = convert('OBX|1|NM|X^Local^L||3||||||F');
    expect(observation.valueQuantity).toEqual({ value: 3 });
    expect(diagnostics(issues)).toContain('OBX-6');
  });
});

describe('OBX metadata', () => {
  it('maps OBX-11 through HL7 table 0085 rather than passing the letter through', () => {
    expect(convert('OBX|1|ST|X^Local^L||text||||||F').observation.status).toBe('final');
    expect(convert('OBX|1|ST|X^Local^L||text||||||P').observation.status).toBe('preliminary');
    expect(convert('OBX|1|ST|X^Local^L||text||||||C').observation.status).toBe('corrected');
  });

  it('records unknown, and reports, for a status the IG does not map', () => {
    // `R` is "results entered, not verified". Calling that `preliminary` would be a
    // clinical assertion; `unknown` is the only honest member of the value set.
    const { observation, issues } = convert('OBX|1|ST|X^Local^L||text||||||R');
    expect(observation.status).toBe('unknown');
    expect(diagnostics(issues)).toContain('OBX-11');
  });

  it('maps OBX-14 to effectiveDateTime and narrows it when there is no offset', () => {
    const { observation } = convert('OBX|1|ST|X^Local^L||text||||||F|||201506011608');
    expect(observation.effectiveDateTime).toBe('2015-06-01');
  });

  it('maps OBX-8 to interpretation under the v3 code system', () => {
    const { observation } = convert('OBX|1|NM|X^Local^L||3.9|kU/L||A^Abnormal^HL70078|||F');
    expect(observation.interpretation).toEqual([
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
            code: 'A',
            display: 'Abnormal'
          }
        ]
      }
    ]);
  });

  it('drops an interpretation code the IG does not map rather than publishing it', () => {
    // `QCF` is inactive in the bound value set; emitting it fails validation.
    const { observation } = convert('OBX|1|NM|X^Local^L||3.9|kU/L||QCF^Quality control failure^HL70078|||F');
    expect(observation.interpretation).toBeUndefined();
  });

  it('attaches an NTE that follows the OBX as a note', () => {
    // IG segment map NTE[Observation]: NTE-3 -> note.text, NTE-6 -> note.time. The
    // note text is the IG ORU_R01 example's own NTE-3.
    const { observation } = convert('OBX|1|NM|X^Local^L||3.9|kU/L|||||F', [
      'NTE|1||Allergy test interpretations are subjective.|RE||20150601181000+0100'
    ]);
    expect(observation.note).toEqual([
      { text: 'Allergy test interpretations are subjective.', time: '2015-06-01T18:10:00+01:00' }
    ]);
  });

  it('reports a repeating OBX-5 rather than keeping only the first result', () => {
    const { observation, issues } = convert('OBX|1|NM|X^Local^L||3.9~4.1|kU/L|||||F');
    expect(observation.valueQuantity).toBeUndefined();
    expect(diagnostics(issues)).toContain('OBX-5');
  });
});
