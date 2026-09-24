import { SYSTEMS } from '@open-twin/fhir-core';
import type { Bundle, DiagnosticReport, Encounter, Observation, Patient } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { convertMessage } from '../fhir/bundleBuilder';
import { HL7V2_LOCAL_SYSTEM } from '../v2/tables';
import { ADT_A01, MDM_T02_HEADER, message, ORU_R01 } from './fixtures/messages';

const TIMESTAMP = '2026-07-26T10:00:00Z';

function entries<T>(bundle: Bundle, resourceType: string): T[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is NonNullable<typeof resource> => resource?.resourceType === resourceType) as T[];
}

describe('the IG ORU_R01 example', () => {
  const result = convertMessage(ORU_R01, { timestamp: TIMESTAMP });

  it('produces one Patient, one Encounter, three Observations and one DiagnosticReport', () => {
    expect(entries<Patient>(result.bundle, 'Patient')).toHaveLength(1);
    expect(entries<Encounter>(result.bundle, 'Encounter')).toHaveLength(1);
    expect(entries<Observation>(result.bundle, 'Observation')).toHaveLength(3);
    expect(entries<DiagnosticReport>(result.bundle, 'DiagnosticReport')).toHaveLength(1);
  });

  it('takes Bundle.timestamp from MSH-7, which carries an offset', () => {
    expect(result.bundle.timestamp).toBe('2015-06-02T10:00:12.43+01:00');
    expect(result.bundle.timestamp).not.toBe(TIMESTAMP);
  });

  it('maps PID-5, PID-7 and PID-8', () => {
    const patient = entries<Patient>(result.bundle, 'Patient')[0];
    expect(patient?.name?.[0]).toEqual({
      use: 'official',
      family: 'Everywoman',
      given: ['Eve', 'L'],
      prefix: ['Dr'],
      suffix: ['Jr', 'PhD']
    });
    // PID-7 is `197006010912`: a date and a time, and Patient.birthDate is a date.
    expect(patient?.birthDate).toBe('1970-06-01');
    expect(patient?.gender).toBe('female');
  });

  /**
   * The IG example declares the assigning authority `3.4.5.6.7` as an ISO universal
   * id. That is not a valid OID — FHIR constrains `urn:oid:` to `[0-2](\.(0|[1-9][0-9]*))+`
   * and the HL7 validator rejects anything else outright. So the identifier keeps
   * its value and its type and loses only the namespace the sender got wrong, and
   * the loss is reported.
   */
  it('drops an assigning authority that is not a valid OID, and says so', () => {
    const patient = entries<Patient>(result.bundle, 'Patient')[0];
    expect(patient?.identifier?.[0]).toEqual({
      value: '1032702',
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] }
    });
    expect(JSON.stringify(result.issues)).toContain('PID-3');
  });

  it('keeps an assigning authority that is a valid OID', () => {
    // The IG ADT_A01 example declares `1.2.3.4.5`, which is well formed.
    const adt = convertMessage(ADT_A01, { timestamp: TIMESTAMP });
    expect(entries<Patient>(adt.bundle, 'Patient')[0]?.identifier?.[0]?.system).toBe('urn:oid:1.2.3.4.5');
  });

  it('maps PV1-2 to an Encounter class and status from the v2 tables', () => {
    const encounter = entries<Encounter>(result.bundle, 'Encounter')[0];
    expect(encounter?.class).toEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'EMER',
      display: 'emergency'
    });
    expect(encounter?.status).toBe('in-progress');
  });

  it('publishes the LN-coded observations under http://loinc.org', () => {
    const observations = entries<Observation>(result.bundle, 'Observation');
    expect(observations.map((observation) => observation.code.coding?.[0]?.system)).toEqual([
      SYSTEMS.LOINC,
      SYSTEMS.LOINC,
      SYSTEMS.LOINC
    ]);
    expect(observations[0]?.valueQuantity).toEqual({
      value: 3.9,
      unit: 'kU/L',
      system: SYSTEMS.UCUM,
      code: 'kU/L'
    });
  });

  it('reports the SN observation rather than publishing a number the laboratory did not send', () => {
    const observations = entries<Observation>(result.bundle, 'Observation');
    const structured = observations[2];
    expect(structured?.code.coding?.[0]?.code).toBe('6265-3');
    expect(structured?.valueQuantity).toBeUndefined();
    expect(structured?.dataAbsentReason).toBeDefined();
    expect(JSON.stringify(result.issues)).toContain('SN');
  });

  it('links the DiagnosticReport to every Observation by fullUrl', () => {
    const report = entries<DiagnosticReport>(result.bundle, 'DiagnosticReport')[0];
    const observationUrls = (result.bundle.entry ?? [])
      .filter((entry) => entry.resource?.resourceType === 'Observation')
      .map((entry) => entry.fullUrl);
    expect(report?.result?.map((reference) => reference.reference)).toEqual(observationUrls);
    expect(report?.status).toBe('final');
    expect(report?.code.coding?.[0]).toEqual({
      system: SYSTEMS.LOINC,
      code: '51523-9'
    });
  });

  it('omits DiagnosticReport.issued because OBR-22 has no offset', () => {
    const report = entries<DiagnosticReport>(result.bundle, 'DiagnosticReport')[0];
    expect(report?.issued).toBeUndefined();
    expect(JSON.stringify(result.issues)).toContain('OBR-22');
  });

  it('reports the order-level NTE the IG leaves unmapped instead of dropping it silently', () => {
    expect(JSON.stringify(result.issues)).toContain('NTE');
  });

  it('is deterministic: the same message converts to the same ids', () => {
    const again = convertMessage(ORU_R01, { timestamp: TIMESTAMP });
    expect(JSON.stringify(again.bundle)).toBe(JSON.stringify(result.bundle));
  });
});

describe('the IG ADT_A01 example', () => {
  const result = convertMessage(ADT_A01, { timestamp: TIMESTAMP });

  it('produces a Patient, an Encounter and the single OBX, and no DiagnosticReport', () => {
    expect(entries<Patient>(result.bundle, 'Patient')).toHaveLength(1);
    expect(entries<Encounter>(result.bundle, 'Encounter')).toHaveLength(1);
    expect(entries<Observation>(result.bundle, 'Observation')).toHaveLength(1);
    expect(entries<DiagnosticReport>(result.bundle, 'DiagnosticReport')).toHaveLength(0);
  });

  it('maps the body height with the LOINC code and the UCUM symbol, not the unit name', () => {
    const observation = entries<Observation>(result.bundle, 'Observation')[0];
    expect(observation?.code.coding?.[0]).toEqual({
      system: SYSTEMS.LOINC,
      code: '8302-2'
    });
    expect(observation?.valueQuantity).toEqual({
      value: 190,
      unit: 'centimeter',
      system: SYSTEMS.UCUM,
      code: 'cm'
    });
  });

  it('takes its timestamp from MSH-7, which has an offset here too', () => {
    expect(result.bundle.timestamp).toBe('2015-06-01T13:58:23+01:00');
  });

  /**
   * The R4 vital-signs profiles auto-apply to LOINC 8302-2 whether or not the
   * resource claims them, and they make both `category` and `effective[x]`
   * mandatory. The IG's example OBX has no OBX-14, so without this the resource is
   * invalid — the HL7 validator reported "Observation.category: minimum required =
   * 1", "Slice 'Observation.category:VSCat': a matching slice is required" and
   * "Observation.effective[x]: minimum required = 1".
   */
  it('satisfies the vital-signs profile that R4 applies to a body height', () => {
    const observation = entries<Observation>(result.bundle, 'Observation')[0];
    expect(observation?.category).toEqual([
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs'
          }
        ]
      }
    ]);
    // No time was sent, so none is invented: the element says the value is unknown.
    expect(observation?.effectiveDateTime).toBeUndefined();
    expect(observation?.effectivePeriod).toEqual({
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', valueCode: 'unknown' }]
    });
  });

  it('does not claim the vital-signs category for a code that is not one', () => {
    const other = convertMessage(
      message(
        'MSH|^~\\&|App|Fac|||20150601135823+0100||ADT^A01^ADT_A01|CTRL1|P|2.5.1',
        'PID|1||1^^^X&1.2.3&ISO^MR||Doe^John||19700601|M',
        'OBX|1|NM|6153-1^IgE Blue Grass Kentucky^LN||3.9|kU/L|||||F'
      ),
      { timestamp: TIMESTAMP }
    );
    const observation = entries<Observation>(other.bundle, 'Observation')[0];
    expect(observation?.category).toBeUndefined();
    expect(observation?.effectivePeriod).toBeUndefined();
  });
});

describe('the caller may supply the subject', () => {
  const subject = { reference: 'Patient/known-to-the-integrator' };
  const result = convertMessage(ADT_A01, { timestamp: TIMESTAMP, subject });

  it('uses it verbatim and does not also emit a Patient of its own', () => {
    // D1: two subjects for one person in one bundle is how everything became
    // attributable to whatever Patient the receiving server already had.
    expect(entries<Patient>(result.bundle, 'Patient')).toHaveLength(0);
    expect(entries<Observation>(result.bundle, 'Observation')[0]?.subject).toEqual(subject);
  });
});

describe('messages this connector does not convert', () => {
  it('refuses a message type it does not support without throwing', () => {
    const result = convertMessage(message(MDM_T02_HEADER, 'PID|||1^^^X^MR||Doe^John||19941201|M'), {
      timestamp: TIMESTAMP
    });
    expect(result.bundle.entry).toBeUndefined();
    expect(JSON.stringify(result.issues)).toContain('not-supported');
  });

  it('refuses something that is not an HL7 v2 message without throwing', () => {
    for (const input of ['', '{"resourceType":"Bundle"}', 'MSH', 'PID|1||x']) {
      const result = convertMessage(input, { timestamp: TIMESTAMP });
      expect(result.issues).toBeDefined();
      expect(result.bundle.resourceType).toBe('Bundle');
    }
  });
});

/**
 * Rule 3, asserted rather than asserted-to. An HL7 v2 message is a patient record:
 * a name, a date of birth, an address, a diagnosis expressed as a code and a number.
 * None of it may reach a log, a stack trace or an error-reporting service.
 */
describe('no part of the message reaches an issue', () => {
  const secrets = [
    'Everywoman',
    'Eve',
    'Madewell',
    '1032702',
    '197006010912',
    '1000 House Lane',
    'eve@test.test',
    '000-00-0000',
    '3.9',
    '0.59',
    'IgE Blue Grass Kentucky',
    '6153-1',
    'Radon',
    'Gonzalez'
  ];

  it.each([
    ['ORU_R01', ORU_R01],
    ['ADT_A01', ADT_A01]
  ])('%s', (_name, raw) => {
    const result = convertMessage(raw, { timestamp: TIMESTAMP });
    const reported = JSON.stringify(result.issues ?? {});
    for (const secret of secrets) {
      expect(reported).not.toContain(secret);
    }
  });

  it('holds for a message whose every field is unreadable', () => {
    // A deliberately broken message: an unmappable sex code, an unmappable status,
    // a bad unit and an unsupported value type, all carrying identifying content.
    const broken = message(
      'MSH|^~\\&|App|Fac|||20150601135823+0100||ORU^R01^ORU_R01|CTRL1|P|2.5.1',
      'PID|1||55512345^^^Hospital&9.9.9&ISO^MR||Sensitive^Patient^Name||19700601|Z',
      'PV1|1|Q^Nonsense^HL70004',
      'OBR|1|||99SECRET^Secret Panel^L|||201506011608',
      'OBX|1|ZZ|99SECRET^Secret Analyte^L||42|furlongs^furlongs^UCUM||||Q'
    );
    const result = convertMessage(broken, { timestamp: TIMESTAMP });
    const reported = JSON.stringify(result.issues ?? {});
    for (const secret of ['Sensitive', 'Patient', 'Name', '55512345', '19700601', '99SECRET', 'furlongs', '42', 'ZZ']) {
      expect(reported).not.toContain(secret);
    }
    expect(result.issues?.issue?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('local codes stay under the system the caller names', () => {
  it('uses the Foundation namespace by default and the caller override when given', () => {
    const local = convertMessage(ADT_A01, { timestamp: TIMESTAMP });
    expect(JSON.stringify(local.bundle)).not.toContain(HL7V2_LOCAL_SYSTEM);

    const perSender = 'http://example.org/fhir/CodeSystem/hospital-a';
    const overridden = convertMessage(
      message(
        'MSH|^~\\&|App|Fac|||20150601135823+0100||ADT^A01^ADT_A01|CTRL1|P|2.5.1',
        'PID|1||1^^^X&9.9&ISO^MR||Doe^John||19700601|M',
        'OBX|1|ST|LOCALCODE^Local analyte^L||text||||F'
      ),
      { timestamp: TIMESTAMP, localCodeSystem: perSender }
    );
    const observation = entries<Observation>(overridden.bundle, 'Observation')[0];
    expect(observation?.code.coding?.[0]?.system).toBe(perSender);
  });
});

describe('scoped HL7 identity', () => {
  const source = (issuer: string, sender = 'SENDER', patient = '12345', control = 'message-1') =>
    `MSH|^~\\&|${sender}|FACILITY|||20260923120000+0000||ORU^R01|${control}|P|2.5.1\r` +
    `PID|1||${patient}^^^&${issuer}&ISO||Example^Research\r` +
    'OBX|1|NM|8302-2^Body height^LN||170|cm|||||F';
  const convert = (raw: string) => convertMessage(raw, { timestamp: TIMESTAMP, bundleType: 'transaction' });

  it('separates matching MRNs from distinct assigning authorities, including transaction targets', () => {
    const a = convert(source('1.2.3.4'));
    const b = convert(source('1.2.3.5'));
    expect(entries<Patient>(a.bundle, 'Patient')[0]?.id).toBeDefined();
    expect(entries<Patient>(a.bundle, 'Patient')[0]?.id).not.toBe(entries<Patient>(b.bundle, 'Patient')[0]?.id);
    expect(a.bundle.entry?.map((entry) => entry.request?.url)).not.toEqual(
      b.bundle.entry?.map((entry) => entry.request?.url)
    );
    expect(convert(source('1.2.3.4')).bundle).toEqual(a.bundle);
  });

  it('scopes authority-less identifiers to the sender', () => {
    const a = convert(source('', 'A'));
    const b = convert(source('', 'B'));
    expect(entries<Patient>(a.bundle, 'Patient')[0]?.id).not.toBe(entries<Patient>(b.bundle, 'Patient')[0]?.id);
  });

  it('scopes message and observation ids even when the same global patient appears at two senders', () => {
    const a = convert(source('1.2.3.4', 'A'));
    const b = convert(source('1.2.3.4', 'B'));
    expect(entries<Patient>(a.bundle, 'Patient')[0]?.id).toBe(entries<Patient>(b.bundle, 'Patient')[0]?.id);
    expect(entries<Observation>(a.bundle, 'Observation')[0]?.id).not.toBe(
      entries<Observation>(b.bundle, 'Observation')[0]?.id
    );
    expect(a.bundle.id).not.toBe(b.bundle.id);
  });

  it('does not derive a patient from a missing identifier or segment position', () => {
    const result = convert(source('1.2.3.4', 'A', ''));
    expect(result.bundle.entry).toBeUndefined();
    expect(JSON.stringify(result.issues)).toContain('stable patient identifier');
    const explicit = convertMessage(source('', 'A', ''), {
      timestamp: TIMESTAMP,
      subject: { reference: 'Patient/known' }
    });
    expect(entries<Observation>(explicit.bundle, 'Observation')[0]?.subject?.reference).toBe('Patient/known');
  });

  it('rejects missing message control IDs and multiple patient segments', () => {
    expect(convert(source('1.2.3.4', 'A', '12345', '')).bundle.entry).toBeUndefined();
    expect(convert(`${source('1.2.3.4')}\rPID|2||67890`).bundle.entry).toBeUndefined();
  });
});

it('keeps local assigning authorities distinct within one HL7 sender', () => {
  const raw = (authority: string) =>
    `MSH|^~\\&|APP|FAC|||20260923120000+0000||ADT^A01|m1|P|2.5.1\rPID|1||12345^^^${authority}`;
  const first = convertMessage(raw('LocalA'), { timestamp: TIMESTAMP });
  const second = convertMessage(raw('LocalB'), { timestamp: TIMESTAMP });
  expect(entries<Patient>(first.bundle, 'Patient')[0]?.id).not.toBe(entries<Patient>(second.bundle, 'Patient')[0]?.id);
});

it('requires an explicit source namespace when the HL7 sender is absent', () => {
  const raw = 'MSH|^~\\&|||||20260923120000+0000||ADT^A01|m1|P|2.5.1\rPID|1||12345';
  expect(convertMessage(raw, { timestamp: TIMESTAMP }).bundle.entry).toBeUndefined();
  const first = convertMessage(raw, { timestamp: TIMESTAMP, sourceNamespace: 'feed-a' });
  const second = convertMessage(raw, { timestamp: TIMESTAMP, sourceNamespace: 'feed-b' });
  expect(entries<Patient>(first.bundle, 'Patient')[0]?.id).toBeDefined();
  expect(entries<Patient>(first.bundle, 'Patient')[0]?.id).not.toBe(entries<Patient>(second.bundle, 'Patient')[0]?.id);
});
