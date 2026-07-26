import { ConnectorError } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import { fhirDateTime } from '../../fhir/time';

describe('fhirDateTime', () => {
  it('re-expresses the instant in the subject zone rather than appending the offset', () => {
    // 22:30 UTC is 00:30 the next day at +02:00. A mapper that appends "+02:00"
    // without shifting the clock produces 2024-01-01T22:30:00+02:00, which is a
    // different instant two hours earlier — and a mapper that drops the offset
    // produces the right instant on the wrong calendar day for the wearer.
    expect(fhirDateTime('2024-01-01T22:30:00+00:00', '+02:00')).toBe('2024-01-02T00:30:00+02:00');
  });

  it('handles western offsets and offsets that are not whole hours', () => {
    expect(fhirDateTime('2024-01-01T02:00:00Z', '-05:30')).toBe('2023-12-31T20:30:00-05:30');
  });

  it('preserves the instant: shifted output parses back to the same epoch', () => {
    const instant = '2024-06-30T21:45:12Z';
    for (const offset of ['+00:00', '+05:45', '-08:00', '+13:00']) {
      expect(Date.parse(fhirDateTime(instant, offset))).toBe(Date.parse(instant));
    }
  });

  it('keeps sub-second precision so consecutive samples do not collapse onto one time', () => {
    expect(fhirDateTime('2024-01-01T08:00:00.250Z', '+00:00')).toBe('2024-01-01T08:00:00.250Z');
    expect(fhirDateTime('2024-01-01T08:00:00.000Z', '+00:00')).toBe('2024-01-01T08:00:00Z');
  });

  it('emits Z when the source supplied no offset', () => {
    expect(fhirDateTime('2024-01-01T08:00:00+00:00')).toBe('2024-01-01T08:00:00Z');
  });

  it('rejects an unparseable timestamp without quoting it', () => {
    // The timestamp arrives inside a patient record. It must not reach a log line.
    expect(() => fhirDateTime('2024-13-45T99:99:99Z')).toThrowError(ConnectorError);
    try {
      fhirDateTime('2024-13-45T99:99:99Z');
      expect.unreachable('expected a ConnectorError');
    } catch (error) {
      const connectorError = error as ConnectorError;
      expect(connectorError.message).not.toContain('2024-13-45');
      expect(connectorError.toString()).not.toContain('2024-13-45');
      expect(connectorError.code).toBe('validation');
    }
  });

  it('rejects a malformed zone offset without quoting it', () => {
    try {
      fhirDateTime('2024-01-01T08:00:00Z', '+2:00');
      expect.unreachable('expected a ConnectorError');
    } catch (error) {
      const connectorError = error as ConnectorError;
      expect(connectorError).toBeInstanceOf(ConnectorError);
      expect(connectorError.toString()).not.toContain('+2:00');
    }
  });
});
