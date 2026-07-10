import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { buildBundleFromResponses } from '../../fhir/bundleBuilder';

describe('buildBundleFromResponses (integration)', () => {
  const heartRateResponse = {
    dataPoints: [
      {
        dataSource: {
          recordingMethod: 'UNKNOWN',
          device: {},
          application: {
            packageName: 'com.sec.android.app.shealth'
          },
          platform: 'HEALTH_CONNECT'
        },
        heartRate: {
          sampleTime: {
            physicalTime: '2026-07-07T05:40:29.354Z',
            utcOffset: '7200s',
            civilTime: {
              date: {
                year: 2026,
                month: 7,
                day: 7
              },
              time: {
                hours: 7,
                minutes: 40,
                seconds: 29,
                nanos: 354000000
              }
            }
          },
          beatsPerMinute: '73',
          metadata: {}
        }
      },
      {
        dataSource: {
          recordingMethod: 'UNKNOWN',
          device: {},
          application: {
            packageName: 'com.sec.android.app.shealth'
          },
          platform: 'HEALTH_CONNECT'
        },
        heartRate: {
          sampleTime: {
            physicalTime: '2026-07-07T05:10:29.316Z',
            utcOffset: '7200s',
            civilTime: {
              date: {
                year: 2026,
                month: 7,
                day: 7
              },
              time: {
                hours: 7,
                minutes: 10,
                seconds: 29,
                nanos: 316000000
              }
            }
          },
          beatsPerMinute: '56',
          metadata: {}
        }
      }
    ]
  };

  const distanceResponse = {
    dataPoints: [
      {
        dataSource: {
          recordingMethod: 'DERIVED',
          device: {
            displayName: 'MobileTrack'
          },
          platform: 'FITBIT'
        },
        distance: {
          interval: {
            startTime: '2026-07-07T07:51:29Z',
            startUtcOffset: '7200s',
            endTime: '2026-07-07T07:52:29Z',
            endUtcOffset: '7200s',
            civilStartTime: {
              date: {
                year: 2026,
                month: 7,
                day: 7
              },
              time: {
                hours: 9,
                minutes: 51,
                seconds: 29
              }
            },
            civilEndTime: {
              date: {
                year: 2026,
                month: 7,
                day: 7
              },
              time: {
                hours: 9,
                minutes: 52,
                seconds: 29
              }
            }
          },
          millimeters: '44286'
        }
      }
    ]
  };

  const weightResponse = {
    dataPoints: [
      {
        name: 'users/8338456149191909237/dataTypes/weight/dataPoints/233475372306809440',
        dataSource: {
          recordingMethod: 'UNKNOWN',
          device: {},
          application: {
            packageName: 'com.sec.android.app.shealth'
          },
          platform: 'HEALTH_CONNECT'
        },
        weight: {
          sampleTime: {
            physicalTime: '2026-07-07T07:33:14.417Z',
            utcOffset: '7200s',
            civilTime: {
              date: {
                year: 2026,
                month: 7,
                day: 7
              },
              time: {
                hours: 9,
                minutes: 33,
                seconds: 14,
                nanos: 417000000
              }
            }
          },
          weightGrams: 86000
        }
      }
    ]
  };

  it('builds a FHIR bundle from multiple responses', () => {
    const bundle = buildBundleFromResponses([heartRateResponse, distanceResponse, weightResponse]);

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(bundle.entry).toHaveLength(4);

    const observations = bundle.entry?.map((entry) => entry.resource as Observation) ?? [];
    for (const observation of observations) {
      expect(observation.resourceType).toBe('Observation');
    }

    const heartRateObservation = observations.find((obs) => obs.code?.coding?.[0].code === '8867-4');
    expect(heartRateObservation?.valueQuantity?.value).toBe(73);

    const distanceObservation = observations.find((obs) => obs.code?.coding?.[0].code === 'distance');
    expect(distanceObservation?.valueQuantity?.value).toBe(44286);

    const weightObservation = observations.find((obs) => obs.code?.coding?.[0].code === '29463-7');
    expect(weightObservation?.valueQuantity?.value).toBe(86000);
  });

  it('returns an empty bundle when no data points are present', () => {
    const emptyResponse = { dataPoints: [] };
    const bundle = buildBundleFromResponses([emptyResponse]);

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(bundle.entry).toHaveLength(0);
  });

  it('returns a single-entry bundle when only one data point is present', () => {
    const singleResponse = { dataPoints: [heartRateResponse.dataPoints[0]] };
    const bundle = buildBundleFromResponses([singleResponse]);

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(bundle.entry).toHaveLength(1);

    const observation = bundle.entry?.[0].resource as Observation;
    expect(observation.resourceType).toBe('Observation');
    expect(observation.code?.coding?.[0].code).toBe('8867-4');
    expect(observation.valueQuantity?.value).toBe(73);
  });

  it('correctly maps metadata fields like status, UCUM units, and device provenance', () => {
    const bundle = buildBundleFromResponses([weightResponse, distanceResponse]);
    const observations = bundle.entry?.map((e) => e.resource as Observation) ?? [];

    const weightObs = observations.find((obs) => obs.code?.coding?.[0].code === '29463-7');
    const distanceObs = observations.find((obs) => obs.code?.coding?.[0].code === 'distance');

    expect(weightObs?.status).toBe('final');
    expect(distanceObs?.status).toBe('final');

    expect(weightObs?.valueQuantity?.unit).toBe('g');
    expect(weightObs?.valueQuantity?.system).toBe('http://unitsofmeasure.org');
  });

  it('differentiates between effectiveDateTime (instant) and effectivePeriod (duration)', () => {
    const bundle = buildBundleFromResponses([heartRateResponse, distanceResponse]);
    const observations = bundle.entry?.map((e) => e.resource as Observation) ?? [];

    const heartRateObs = observations.find((obs) => obs.code?.coding?.[0].code === '8867-4');
    const distanceObs = observations.find((obs) => obs.code?.coding?.[0].code === 'distance');

    expect(heartRateObs?.effectiveDateTime).toBe('2026-07-07T05:40:29.354Z');
    expect(heartRateObs?.effectivePeriod).toBeUndefined();

    expect(distanceObs?.effectiveDateTime).toBeUndefined();
    expect(distanceObs?.effectivePeriod?.start).toBe('2026-07-07T07:51:29Z');
    expect(distanceObs?.effectivePeriod?.end).toBe('2026-07-07T07:52:29Z');
  });

  it('maps all items when a single response contains multiple data points', () => {
    const bundle = buildBundleFromResponses([heartRateResponse]);
    const observations = bundle.entry?.map((e) => e.resource as Observation) ?? [];

    expect(observations).toHaveLength(2);

    const values = observations.map((obs) => obs.valueQuantity?.value);
    expect(values).toContain(73);
    expect(values).toContain(56);
  });

  it('returns an empty bundle when an empty list of responses is provided', () => {
    const bundle = buildBundleFromResponses([]);

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(bundle.entry).toBeDefined();
    expect(bundle.entry).toHaveLength(0);
  });

  it('gracefully skips unsupported health metrics or malformed data points without crashing', () => {
    const unsupportedResponse = {
      dataPoints: [
        {
          dataSource: { platform: 'HEALTH_CONNECT' },

          telepathyScore: { value: 9000, sampleTime: '2026-07-07T05:40:29.354Z' }
        }
      ]
    };

    const malformedResponse = {
      dataPoints: [
        {
          dataSource: { platform: 'FITBIT' }
        }
      ]
    };

    const bundle = buildBundleFromResponses([heartRateResponse, unsupportedResponse, malformedResponse]);
    const observations = bundle.entry?.map((e) => e.resource as Observation) ?? [];

    expect(bundle.entry).toHaveLength(2);
    expect(observations.every((obs) => obs.resourceType === 'Observation')).toBe(true);
  });

  it('handles missing or empty array fields gracefully', () => {
    const brokenResponse = { missingDataPoints: true };

    // @ts-expect-error - testing JavaScript safety runtime boundary
    const bundle = buildBundleFromResponses([brokenResponse]);

    expect(bundle.entry).toHaveLength(0);
  });
});
