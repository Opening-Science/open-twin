import { describe, expect, it } from 'vitest';
import { parseV2DateTime, v2Date, v2Instant } from '../v2/datetime';

/**
 * FHIR R4 `dateTime`, quoted:
 *   "If hours and minutes are specified, a time zone SHALL be populated."
 *   "Seconds must be provided due to schema type constraints but may be zero-filled
 *    and may be ignored at receiver discretion."
 *
 * These tests assert against that specification and against the FHIR dateTime
 * regex, not against whatever this module currently returns.
 */
const FHIR_DATETIME =
  /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?)?)?$/;

const parse = (raw: string) => {
  const result = parseV2DateTime(raw);
  if (!result.ok) throw new Error('expected a parseable timestamp');
  return result.parsed;
};

describe('an offset the sender stated', () => {
  it('is preserved rather than normalised to UTC', () => {
    // From the IG ORU_R01 example, MSH-7.
    const parsed = parse('20150602100012.43+0100');
    expect(parsed.value).toBe('2015-06-02T10:00:12.43+01:00');
    expect(parsed.narrowed).toBe(false);
    expect(FHIR_DATETIME.test(parsed.value)).toBe(true);
  });

  it('keeps a western offset as written', () => {
    const parsed = parse('20150624084727.655-0500');
    expect(parsed.value).toBe('2015-06-24T08:47:27.655-05:00');
    expect(FHIR_DATETIME.test(parsed.value)).toBe(true);
  });

  it('zero-fills seconds, which the FHIR specification permits, when only minutes are given', () => {
    const parsed = parse('201506011358+0100');
    expect(parsed.value).toBe('2015-06-01T13:58:00+01:00');
    expect(FHIR_DATETIME.test(parsed.value)).toBe(true);
  });

  it('renders +0000 as an explicit zero offset, never as a bare local time', () => {
    const parsed = parse('20230814011500+0000');
    expect(parsed.value).toBe('2023-08-14T01:15:00+00:00');
    expect(FHIR_DATETIME.test(parsed.value)).toBe(true);
  });
});

describe('a timestamp with no offset', () => {
  /**
   * DECISIONS.md D7. `new Date('20150601135800').toISOString()` and every variant of
   * appending `Z` moves the instant by the sender's offset — up to fourteen hours,
   * across a date boundary. The value below is PV1-44 from the IG ORU_R01 example.
   */
  it('is narrowed to the date instead of being assumed to be UTC', () => {
    const parsed = parse('20150601135800');
    expect(parsed.value).toBe('2015-06-01');
    expect(parsed.narrowed).toBe(true);
    expect(parsed.missingOffset).toBe(true);
    expect(parsed.precision).toBe('day');
    expect(FHIR_DATETIME.test(parsed.value)).toBe(true);
  });

  it('does not silently acquire a Z', () => {
    expect(parse('201506011811').value).not.toContain('Z');
    expect(parse('201506011811').value).not.toContain('T');
  });

  it('is not usable as a FHIR instant', () => {
    // `instant` is a moment: without an offset there is no moment, only a wall clock.
    expect(v2Instant('201506011811')).toBeUndefined();
    expect(v2Instant('20150602100012.43+0100')).toBe('2015-06-02T10:00:12.43+01:00');
  });
});

describe('precision', () => {
  it('narrows to the precision actually present', () => {
    expect(parse('2015').value).toBe('2015');
    expect(parse('201506').value).toBe('2015-06');
    expect(parse('20150601').value).toBe('2015-06-01');
    expect(parse('2015').precision).toBe('year');
    expect(parse('201506').precision).toBe('month');
  });

  it('refuses to invent minutes for an hour-precision timestamp', () => {
    // FHIR cannot express hour precision, and `:00` would be up to 59 minutes wrong.
    // Only seconds may be zero-filled, and only because the specification says so.
    const parsed = parse('2015060113+0100');
    expect(parsed.value).toBe('2015-06-01');
    expect(parsed.narrowed).toBe(true);
  });

  it('produces a FHIR date for PID-7, whatever precision the sender used', () => {
    // PID-7 from the IG ORU_R01 example carries a time; Patient.birthDate is a date.
    expect(v2Date('197006010912')).toBe('1970-06-01');
    expect(v2Date('19941201')).toBe('1994-12-01');
    expect(v2Date('1994')).toBe('1994');
  });
});

describe('input that is not a timestamp', () => {
  it('is rejected rather than coerced', () => {
    for (const raw of ['', 'not a date', '2015-06-01', '20151301', '20150632', '20150601250000+0100', '201506011']) {
      expect(parseV2DateTime(raw).ok).toBe(false);
    }
  });

  it('rejects an offset FHIR cannot express', () => {
    // The FHIR regex admits -14:00 to +14:00, and at 14 hours only the whole hour.
    expect(parseV2DateTime('20150601135800+1500').ok).toBe(false);
    expect(parseV2DateTime('20150601135800+1430').ok).toBe(false);
    expect(parseV2DateTime('20150601135800+1400').ok).toBe(true);
  });

  it('rejects a fraction with no seconds to be a fraction of', () => {
    expect(parseV2DateTime('201506011358.5+0100').ok).toBe(false);
  });
});
