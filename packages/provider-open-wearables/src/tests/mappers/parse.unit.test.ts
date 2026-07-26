import { ConnectorError } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import { parseOrThrow } from '../../api/parse';
import { SleepSessionPageSchema } from '../../api/schemas/events';
import { TimeSeriesPageSchema } from '../../api/schemas/timeseries';

describe('parseOrThrow', () => {
  it('never carries the offending value into the error, its string form or its cause', () => {
    // The realistic failure is a server change, and the payload that trips it is a
    // real person's record. `schema.parse()` would put "Marathon Mary" and the
    // heart rate straight into the message, the stack trace and every log sink
    // downstream of it.
    const leaky = {
      data: [
        {
          timestamp: '2024-01-01T08:00:00+00:00',
          type: 'heart_rate',
          value: 'MarathonMary-198bpm',
          unit: 'bpm'
        }
      ]
    };

    try {
      parseOrThrow(TimeSeriesPageSchema, leaky, 'GET users/{id}/timeseries');
      expect.unreachable('expected a ConnectorError');
    } catch (error) {
      const connectorError = error as ConnectorError;
      expect(connectorError).toBeInstanceOf(ConnectorError);
      const rendered = `${connectorError.message} ${connectorError.toString()} ${JSON.stringify(connectorError.cause ?? null)}`;
      expect(rendered).not.toContain('MarathonMary');
      expect(rendered).not.toContain('198');
      // The field path is retained, because that is what makes the error useful.
      expect(connectorError.toString()).toContain('value');
    }
  });

  it('replaces array indices, which identify which record failed', () => {
    const page = {
      data: [
        { timestamp: '2024-01-01T08:00:00Z', type: 'heart_rate', value: 72, unit: 'bpm' },
        { timestamp: '2024-01-01T08:01:00Z', type: 'heart_rate', value: 73, unit: 'bpm' },
        { timestamp: '2024-01-01T08:02:00Z', type: 'heart_rate', unit: 'bpm' }
      ]
    };
    try {
      parseOrThrow(TimeSeriesPageSchema, page, 'GET users/{id}/timeseries');
      expect.unreachable('expected a ConnectorError');
    } catch (error) {
      const rendered = (error as ConnectorError).toString();
      expect(rendered).toContain('data.[].value');
      expect(rendered).not.toContain('data.2');
    }
  });

  it('accepts a null for every field the response model declares as optional', () => {
    const page = parseOrThrow(
      TimeSeriesPageSchema,
      {
        data: [
          {
            timestamp: '2024-01-01T08:00:00+00:00',
            zone_offset: null,
            type: 'heart_rate',
            value: 72,
            unit: 'bpm',
            source: null,
            is_daily_total: null
          }
        ]
      },
      'GET users/{id}/timeseries'
    );
    expect(page.data).toHaveLength(1);
  });

  it('rejects a zone offset that does not match the pattern the platform enforces', () => {
    expect(() =>
      parseOrThrow(
        SleepSessionPageSchema,
        {
          data: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              start_time: '2024-01-01T22:00:00+00:00',
              end_time: '2024-01-02T06:30:00+00:00',
              zone_offset: 'Europe/Zurich',
              source: { provider: 'oura' },
              duration_seconds: 30600
            }
          ]
        },
        'GET users/{id}/events/sleep'
      )
    ).toThrowError(ConnectorError);
  });
});
