// Hand-authored synthetic FHIR data, contributed under the repository's MIT licence.
import {
  ConnectorError,
  declareMeasurement,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  SYSTEMS,
  uuidv5
} from '@open-twin/fhir-core';
import { buildBundleFromResponses, GOOGLE_HEALTH_MEASUREMENTS } from '@open-twin/provider-google-health';
import type { Bundle, FhirResource, Observation } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import { type AggregateOptions, aggregate, type SourceBundle } from '../aggregate';
import { createMeasurementCatalogue } from '../catalogue';
import { generateReconciliationConfiguration } from '../configuration';
import { aggregateBundle, aggregateContainedBundle, aggregateRelativeBundle } from '../verification/exampleBundle';

const SYSTEM = 'https://example.test/measurements';
const ASLEEP = { system: SYSTEM, code: 'asleep' };
const IN_BED = { system: SYSTEM, code: 'in-bed' };
const SATURATION = { system: SYSTEM, code: 'saturation' };
const PANEL = { system: SYSTEM, code: 'panel' };
const SUBJECT = { reference: 'https://example.test/fhir/Patient/synthetic-person' };
const PERIOD = { start: '2026-06-20T22:00:00Z', end: '2026-06-21T06:00:00Z' };
const TIMESTAMP = '2026-11-18T08:00:00Z';
const ABSENT = { coding: [{ system: SYSTEMS.DATA_ABSENT_REASON, code: 'unknown' }] };

function registration(connector: string): MeasurementDeclarationSet {
  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    connector,
    version: 1,
    coverage: 'open',
    definitions: [],
    declarations: [
      declareMeasurement('total-sleep-time', ASLEEP),
      declareMeasurement('total-sleep-time', ASLEEP, PANEL),
      declareMeasurement('oxygen-saturation', SATURATION),
      ...(connector === 'alpha' ? [declareMeasurement('time-in-bed', IN_BED)] : [])
    ]
  };
}

const CATALOGUE = createMeasurementCatalogue([registration('alpha'), registration('beta'), registration('gamma')]);

function observation(id: string, overrides: Partial<Observation> = {}): Observation {
  return {
    resourceType: 'Observation',
    id: uuidv5(id),
    status: 'final',
    code: { coding: [ASLEEP] },
    subject: SUBJECT,
    effectivePeriod: { ...PERIOD },
    valueQuantity: { value: 420, system: SYSTEMS.UCUM, code: 'min' },
    ...overrides
  };
}

function source(connector: string, observations: Observation[]): SourceBundle {
  return {
    connector,
    bundle: {
      resourceType: 'Bundle',
      type: 'collection',
      entry: observations.map((resource) => ({
        ...(resource.id ? { fullUrl: `urn:uuid:${resource.id}` } : {}),
        resource
      }))
    }
  };
}

function restSource(connector: string, base: string, resources: FhirResource[]): SourceBundle {
  return {
    connector,
    bundle: {
      resourceType: 'Bundle',
      type: 'collection',
      entry: resources.map((resource) => ({ fullUrl: `${base}/${resource.resourceType}/${resource.id}`, resource }))
    }
  };
}

function options(
  sources = [source('alpha', [observation('a')]), source('beta', [observation('b')])]
): AggregateOptions {
  return { sources, subjectKey: 'synthetic-person', timestamp: TIMESTAMP };
}

function enabled(
  sources?: SourceBundle[],
  mode: 'strict' | 'fallback' = 'strict',
  priority = ['alpha', 'beta', 'gamma']
): AggregateOptions {
  const configuration = generateReconciliationConfiguration(CATALOGUE);
  configuration.measurements['total-sleep-time'] = { sourcePriority: priority, missingData: mode };
  return { ...options(sources), reconciliation: { enabled: true, catalogue: CATALOGUE, configuration } };
}

function derived(bundle: Bundle): Observation[] {
  return (bundle.entry ?? [])
    .map(({ resource }) => resource as Observation)
    .filter((resource) =>
      resource.method?.coding?.some((coding) => coding.system === SYSTEMS.METHOD && coding.code === 'source-selected')
    );
}

describe('basic bundling', () => {
  it.each([undefined, { enabled: false } as const])('does not make source decisions when disabled: %j', (setting) => {
    const input = { ...options(), reconciliation: setting };
    const before = structuredClone(input);
    const result = aggregate(input);
    expect(result.reconciliationStatus).toBe('disabled');
    expect(result.reconciliations).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(derived(result.bundle)).toEqual([]);
    expect(result.bundle.entry).toEqual(input.sources.flatMap(({ bundle }) => bundle.entry ?? []));
    expect(input).toEqual(before);
    result.bundle.entry?.pop();
    expect(input).toEqual(before);
  });

  it('carries undeclared, unique, missing-value and pre-existing derived observations untouched', () => {
    const resources = [
      observation('unknown', { code: { coding: [{ system: SYSTEM, code: 'undeclared' }] } }),
      observation('unique', { code: { coding: [IN_BED] } }),
      observation('absent', { valueQuantity: undefined, dataAbsentReason: ABSENT }),
      observation('existing', { derivedFrom: [{ reference: `urn:uuid:${uuidv5('unknown')}` }] })
    ];
    const result = aggregate(options([source('alpha', resources)]));
    expect(result.bundle.entry?.map(({ resource }) => resource)).toEqual(resources);
    expect(result.reconciliations).toEqual([]);
  });

  it('preserves non-UUID ids, absolute fullUrls, and Patient/Device/derivedFrom reference graphs', () => {
    const input = options([
      {
        connector: 'foreign',
        bundle: {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [
            {
              fullUrl: 'https://example.test/fhir/Patient/synthetic-person',
              resource: { resourceType: 'Patient', id: 'synthetic-person' }
            },
            { fullUrl: 'https://example.test/fhir/Device/sensor', resource: { resourceType: 'Device', id: 'sensor' } },
            {
              fullUrl: 'https://example.test/fhir/Observation/reading',
              request: { method: 'PUT', url: 'Observation/reading' },
              resource: observation('ignored', { id: 'reading', device: { reference: 'Device/sensor' } })
            },
            {
              fullUrl: 'https://example.test/fhir/Observation/previous-derived',
              resource: observation('ignored', {
                id: 'previous-derived',
                derivedFrom: [{ reference: 'Observation/reading' }]
              })
            }
          ]
        }
      }
    ]);
    const result = aggregate(input);
    expect(result.bundle.type).toBe('collection');
    expect(result.bundle.entry).toEqual(
      input.sources[0]?.bundle.entry?.map(({ request: _request, ...entry }) => entry)
    );
    const output = result.bundle.entry?.[2]?.resource as Observation;
    output.valueQuantity = { value: 1 };
    const original = input.sources[0]?.bundle.entry?.[2]?.resource as Observation | undefined;
    expect(original?.valueQuantity?.value).toBe(420);
  });

  it('coalesces identical resources at an address without depending on property order', () => {
    const a = observation('same');
    const { id, ...rest } = a;
    const result = aggregate(options([source('alpha', [a]), source('beta', [{ ...rest, id }])]));
    expect(result.bundle.entry).toHaveLength(1);
  });

  it('rejects conflicting addresses without revealing payloads', () => {
    const a = observation('same');
    expect(() =>
      aggregate(options([source('alpha', [a]), source('beta', [{ ...a, valueString: 'private-marker' }])]))
    ).toThrow('Conflicting source resources');
    try {
      aggregate(options([source('alpha', [a]), source('beta', [{ ...a, valueString: 'private-marker' }])]));
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect(String(error)).not.toContain('private-marker');
    }
  });

  it('does not change id-less source resources', () => {
    const result = aggregate(options([source('alpha', [observation('a', { id: undefined })])]));
    expect(result.bundle.entry?.[0]?.resource?.id).toBeUndefined();
  });

  it('keeps the existing empty-source, attribution, and one-subject guards', () => {
    expect(() => aggregate(options([]))).toThrow(/at least one/);
    expect(() => aggregate(options([{ bundle: { resourceType: 'Bundle', type: 'collection' } }]))).toThrow(
      /connector tag/
    );
    expect(() =>
      aggregate(
        options([
          source('alpha', [observation('a')]),
          source('beta', [observation('b', { subject: { reference: 'https://example.test/fhir/Patient/different' } })])
        ])
      )
    ).toThrow(/different subjects/);
    expect(() =>
      aggregate(options([{ connector: 'alpha', bundle: { resourceType: 'Bundle', type: 'collection', entry: [{}] } }]))
    ).toThrow(/contain resources/);
  });

  it('attributes sources by their connector tag', () => {
    const input = source('alpha', [observation('a')]);
    input.connector = undefined;
    input.bundle.meta = { tag: [{ system: 'http://opentwin.ch/fhir/CodeSystem/connector', code: 'alpha' }] };
    expect(aggregate(options([input])).bundle.entry).toHaveLength(1);
  });
});

describe('reference context and patient identity', () => {
  it.each([false, true])(
    'rejects equal relative patient ids on different FHIR servers: enabled=%s',
    (reconciliation) => {
      const sources = ['alpha', 'beta'].map((connector) =>
        restSource(connector, `https://${connector}.test/fhir`, [
          observation(connector, { subject: { reference: 'Patient/private-patient-marker' } }),
          { resourceType: 'Patient', id: 'private-patient-marker' }
        ])
      );
      const input = reconciliation ? enabled(sources) : options(sources);
      const before = structuredClone(input);
      expect(() => aggregate(input)).toThrow(/different subjects/);
      try {
        aggregate(input);
      } catch (error) {
        expect(error).toBeInstanceOf(ConnectorError);
        expect(String(error)).not.toContain('private-patient-marker');
      }
      expect(input).toEqual(before);
    }
  );

  it('groups relative and absolute references only when they identify the same patient', () => {
    const sources = [
      restSource('alpha', 'https://example.test/fhir', [
        observation('relative', { subject: { reference: 'Patient/synthetic-person' } }),
        { resourceType: 'Patient', id: 'synthetic-person' }
      ]),
      restSource('beta', 'https://example.test/fhir', [observation('absolute')])
    ];
    const input = enabled(sources);
    const before = structuredClone(input);
    const first = aggregate(input);
    const reversed = aggregate({ ...input, sources: [...sources].reverse() });
    expect(first.reconciliations).toHaveLength(1);
    expect(first.reconciliations[0]?.selected).toBe('alpha');
    expect(derived(first.bundle)[0]?.subject).toEqual(SUBJECT);
    expect(derived(first.bundle)[0]?.derivedFrom).toHaveLength(2);
    expect(derived(reversed.bundle)).toEqual(derived(first.bundle));
    expect(first.bundle.entry?.slice(0, 3)).toEqual(sources.flatMap(({ bundle }) => bundle.entry ?? []));
    expect(input).toEqual(before);
  });

  it('does not equate equal patient ids on different service roots of the same host', () => {
    const sources = ['one', 'two'].map((root, index) =>
      restSource(index === 0 ? 'alpha' : 'beta', `https://example.test/${root}`, [
        observation(root, { subject: { reference: 'Patient/person' } })
      ])
    );
    expect(() => aggregate(enabled(sources))).toThrow(/different subjects/);
  });

  it('accepts a common absolute patient reference across different source servers', () => {
    const result = aggregate(
      enabled([
        restSource('alpha', 'https://alpha.test/fhir', [observation('a')]),
        restSource('beta', 'https://beta.test/fhir', [observation('b')])
      ])
    );
    expect(result.reconciliations).toHaveLength(1);
    expect(derived(result.bundle)[0]?.subject).toEqual(SUBJECT);
    expect(derived(result.bundle)[0]?.derivedFrom).toHaveLength(2);
  });

  it.each([false, true])(
    'rejects subject identity with no defined relative resolution base: enabled=%s',
    (reconciliation) => {
      const sources = [source('alpha', [observation('unbased', { subject: { reference: 'Patient/private-marker' } })])];
      expect(() => aggregate(reconciliation ? enabled(sources) : options(sources))).toThrow(
        /relative references require a RESTful/
      );
    }
  );
  it.each([
    undefined,
    'https://localhost/person',
    'https://example.test/opaque?path=/Observation/reading',
    'https://example.test/opaque#Observation/reading'
  ])('does not infer a RESTful base from an absent address, hostname, query or fragment: %s', (fullUrl) => {
    const input: SourceBundle = {
      connector: 'alpha',
      bundle: {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            fullUrl,
            resource: observation('unresolved', { subject: { reference: 'Patient/person' } })
          }
        ]
      }
    };
    expect(() => aggregate(options([input]))).toThrow(/relative references require a RESTful/);
  });
});

describe('explicit enablement and validation', () => {
  it('rejects missing configuration at runtime, even with no readings', () => {
    const input = enabled([source('alpha', [])]);
    if (input.reconciliation?.enabled) Reflect.deleteProperty(input.reconciliation, 'configuration');
    expect(() => aggregate(input)).toThrow(/requires a catalogue and configuration/);
  });

  it('rejects missing catalogue and invalid enablement', () => {
    const input = enabled();
    if (input.reconciliation?.enabled) Reflect.deleteProperty(input.reconciliation, 'catalogue');
    expect(() => aggregate(input)).toThrow(/requires a catalogue and configuration/);
    Object.assign(input, { reconciliation: { enabled: 'true' } });
    expect(() => aggregate(input)).toThrow(/boolean enabled/);
  });

  it('validates saved preferences instead of repairing or generating them', () => {
    const input = enabled([source('alpha', [])]);
    if (!input.reconciliation?.enabled) throw new Error('test setup');
    input.reconciliation.configuration.measurements['total-sleep-time'] = {
      sourcePriority: ['alpha', 'alpha'],
      missingData: 'strict'
    };
    const before = structuredClone(input);
    expect(() => aggregate(input)).toThrow(/duplicate-source/);
    expect(input).toEqual(before);
    input.reconciliation.configuration.measurements = {};
    expect(() => aggregate(input)).toThrow(/missing-key/);
  });

  it('distinguishes no discoverable occasions from disabled reconciliation', () => {
    const result = aggregate(enabled([source('alpha', []), source('beta', [])]));
    expect(result.reconciliationStatus).toBe('no-occasions');
    expect(result.reconciliations).toEqual([]);
  });
});

describe('configured source selection', () => {
  it('selects by saved preference, independently of registration and bundle order', () => {
    const input = enabled(undefined, 'strict', ['beta', 'alpha']);
    const before = structuredClone(input);
    const forwards = aggregate(input);
    const backwards = aggregate({ ...input, sources: [...input.sources].reverse() });
    expect(forwards.reconciliations).toEqual(backwards.reconciliations);
    expect(derived(forwards.bundle)).toEqual(derived(backwards.bundle));
    expect(forwards.reconciliations[0]).toMatchObject({ selected: 'beta', outcome: 'selected', reason: 'selected' });
    expect(forwards.reconciliations[0]?.policy).toContain('configured strict preference');
    expect(input).toEqual(before);
  });

  it('applies strict policy even when only a nonpreferred source returned data', () => {
    const result = aggregate(enabled([source('beta', [observation('b')])]));
    expect(result.reconciliations[0]).toMatchObject({
      outcome: 'abstained',
      reason: 'no-eligible-reading',
      attempts: [{ connector: 'alpha', eligibleCount: 0, reason: 'no-eligible-reading' }]
    });
    expect(derived(result.bundle)).toEqual([]);
  });

  it('can select the sole reporting preferred source for a catalogue-shared key', () => {
    expect(aggregate(enabled([source('alpha', [observation('a')])])).reconciliations[0]?.selected).toBe('alpha');
  });

  it('falls back in saved order and reports absent sources', () => {
    const result = aggregate(enabled([source('gamma', [observation('g')])], 'fallback'));
    expect(result.reconciliations[0]).toMatchObject({
      selected: 'gamma',
      outcome: 'fallback',
      attempts: [
        { connector: 'alpha', reason: 'no-eligible-reading' },
        { connector: 'beta', reason: 'no-eligible-reading' },
        { connector: 'gamma', reason: 'selected' }
      ]
    });
  });

  it.each([
    ['data-absent', { valueQuantity: undefined, dataAbsentReason: ABSENT }],
    ['missing-value', { valueQuantity: undefined }],
    ['invalid-value', { valueQuantity: { value: Number.NaN, system: SYSTEMS.UCUM, code: 'min' } }],
    ['unit-mismatch', { valueQuantity: { value: 420, system: SYSTEMS.UCUM, code: 's' } }],
    ['unusable-status', { status: 'cancelled' }]
  ] satisfies [string, Partial<Observation>][])(
    'does not select %s; fallback may use the next eligible source',
    (reason, overrides) => {
      const sources = [source('alpha', [observation('a', overrides)]), source('beta', [observation('b')])];
      const strict = aggregate(enabled(sources));
      expect(strict.reconciliations[0]?.outcome).toBe('abstained');
      expect(strict.reconciliations[0]?.attempts[0]?.ineligibleReasons).toContain(reason);
      const fallback = aggregate(enabled(sources, 'fallback'));
      expect(fallback.reconciliations[0]).toMatchObject({ selected: 'beta', outcome: 'fallback' });
      expect(derived(fallback.bundle)[0]?.derivedFrom).toHaveLength(2);
    }
  );

  it('abstains after fallback exhaustion and never restores excluded sources', () => {
    const sources = [
      source('alpha', [observation('a', { valueQuantity: undefined })]),
      source('gamma', [observation('g')])
    ];
    const result = aggregate(enabled(sources, 'fallback', ['alpha', 'beta']));
    expect(result.reconciliations[0]).toMatchObject({ outcome: 'abstained', reason: 'no-eligible-reading' });
    expect(result.reconciliations[0]?.attempts.map(({ connector }) => connector)).toEqual(['alpha', 'beta']);
    expect(derived(result.bundle)).toEqual([]);
  });

  it.each(['strict', 'fallback'] as const)('stops %s at ambiguous same-source readings', (mode) => {
    const sources = [source('alpha', [observation('a1'), observation('a2')]), source('beta', [observation('b')])];
    const result = aggregate(enabled(sources, mode));
    expect(result.reconciliations[0]).toMatchObject({ outcome: 'abstained', reason: 'ambiguous-readings' });
    expect(result.reconciliations[0]?.attempts).toHaveLength(1);
    expect(derived(result.bundle)).toEqual([]);
    const reversed = sources
      .map(({ bundle, ...rest }) => ({ ...rest, bundle: { ...bundle, entry: [...(bundle.entry ?? [])].reverse() } }))
      .reverse();
    expect(aggregate(enabled(reversed, mode)).reconciliations).toEqual(result.reconciliations);
  });

  it('stops at ambiguity encountered after an earlier fallback source was absent', () => {
    const result = aggregate(
      enabled([source('beta', [observation('b1'), observation('b2')]), source('gamma', [observation('g')])], 'fallback')
    );
    expect(result.reconciliations[0]?.attempts.map(({ reason }) => reason)).toEqual([
      'no-eligible-reading',
      'ambiguous-readings'
    ]);
    expect(result.reconciliations[0]?.selected).toBeUndefined();
  });

  it('does not treat one eligible and one unusable same-source reading as ambiguity', () => {
    const result = aggregate(
      enabled([source('alpha', [observation('a'), observation('absent', { valueQuantity: undefined })])])
    );
    expect(result.reconciliations[0]?.selected).toBe('alpha');
    expect(derived(result.bundle)[0]?.derivedFrom).toHaveLength(2);
  });

  it('coalesces repeated identical records before selection and keeps original diagnostic positions', () => {
    const reading = observation('a');
    const input = enabled([
      source('alpha', [
        reading,
        structuredClone(reading),
        observation('unknown', { code: { coding: [{ system: SYSTEM, code: 'unknown' }] } })
      ]),
      source('alpha', [structuredClone(reading)])
    ]);
    const result = aggregate(input);
    expect(result.reconciliations[0]?.selected).toBe('alpha');
    expect(result.reconciliations[0]?.attempts[0]?.eligibleCount).toBe(1);
    expect(result.issues).toContainEqual({
      code: 'undeclared-measurement',
      matchedKeys: [],
      sourceIndex: 0,
      observationIndex: 2,
      location: 'observation'
    });
    expect(result.bundle.entry).toHaveLength(3);
  });

  it('treats zero as a present value', () => {
    const result = aggregate(
      enabled([
        source('alpha', [observation('zero', { valueQuantity: { value: 0, system: SYSTEMS.UCUM, code: 'min' } })])
      ])
    );
    expect(derived(result.bundle)[0]?.valueQuantity?.value).toBe(0);
  });
});

describe('automatic discovery', () => {
  it('normalizes offsets and fractional trailing zeros without losing sub-millisecond precision', () => {
    const sources = [
      source('alpha', [
        observation('a', {
          effectivePeriod: { start: '2026-06-21T00:00:00.000100+02:00', end: '2026-06-21T08:00:00+02:00' }
        })
      ]),
      source('beta', [observation('b', { effectivePeriod: { start: '2026-06-20T22:00:00.0001Z', end: PERIOD.end } })])
    ];
    const result = aggregate(enabled(sources));
    expect(result.reconciliations).toHaveLength(1);
    expect(result.reconciliations[0]?.window).toEqual({
      kind: 'period',
      start: '2026-06-20T22:00:00.0001Z',
      end: PERIOD.end
    });
    expect(derived(result.bundle)[0]?.derivedFrom).toHaveLength(2);
    const second = sources[1]?.bundle.entry?.[0]?.resource as Observation;
    second.effectivePeriod = { start: '2026-06-20T22:00:00.0002Z', end: PERIOD.end };
    expect(aggregate(enabled(sources)).reconciliations).toHaveLength(2);
  });

  it('keeps different periods, overlapping periods, and separate nights distinct', () => {
    const result = aggregate(
      enabled([
        source('alpha', [observation('a')]),
        source('beta', [
          observation('overlap', { effectivePeriod: { ...PERIOD, start: '2026-06-20T23:00:00Z' } }),
          observation('next', { effectivePeriod: { start: '2026-06-21T22:00:00Z', end: '2026-06-22T06:00:00Z' } })
        ])
      ])
    );
    expect(result.reconciliations).toHaveLength(3);
    expect(result.reconciliations.filter(({ outcome }) => outcome === 'abstained')).toHaveLength(2);
  });

  it('accepts equivalent effectiveInstant/effectiveDateTime readings but not summaries at an instant', () => {
    const instant = (id: string, time: Partial<Observation>) =>
      observation(id, {
        code: { coding: [SATURATION] },
        effectivePeriod: undefined,
        valueQuantity: { value: 98, system: SYSTEMS.UCUM, code: '%' },
        ...time
      });
    const result = aggregate(
      enabled([
        source('alpha', [instant('a', { effectiveInstant: '2026-06-21T08:00:00+02:00' })]),
        source('beta', [instant('b', { effectiveDateTime: PERIOD.end })])
      ])
    );
    expect(result.reconciliations).toHaveLength(1);
    expect(result.reconciliations[0]?.selected).toBe('alpha');
    const summary = aggregate(
      enabled([
        source('alpha', [observation('summary', { effectivePeriod: undefined, effectiveDateTime: PERIOD.end })])
      ])
    );
    expect(summary.reconciliations[0]?.attempts[0]?.ineligibleReasons).toContain('context-mismatch');
    expect(derived(summary.bundle)).toEqual([]);
  });

  it.each([
    { effectivePeriod: undefined },
    { effectivePeriod: undefined, effectiveDateTime: '2026-06-21' },
    { effectivePeriod: { start: PERIOD.start } },
    { effectivePeriod: { start: '2026-02-30T00:00:00Z', end: PERIOD.end } },
    { effectiveDateTime: PERIOD.start }
  ] satisfies Partial<Observation>[])('reports undiscoverable timing without inventing boundaries: %j', (time) => {
    const result = aggregate(enabled([source('alpha', [observation('a', time)])]));
    expect(result.reconciliationStatus).toBe('no-occasions');
    expect(result.issues.some(({ code }) => code === 'missing-time' || code === 'invalid-time')).toBe(true);
    expect(result.bundle.entry).toHaveLength(1);
    expect(JSON.stringify(result.issues)).not.toContain(PERIOD.start);
  });

  it('carries missing-subject, unique, undeclared and unregistered values with explicit diagnostics', () => {
    const result = aggregate(
      enabled([
        source('alpha', [
          observation('missing-subject', { subject: undefined }),
          observation('unique', { code: { coding: [IN_BED] } }),
          observation('unknown', { code: { coding: [{ system: SYSTEM, code: 'unknown' }] } })
        ]),
        source('unregistered', [observation('unregistered')])
      ])
    );
    expect(result.reconciliations).toEqual([]);
    expect(result.bundle.entry).toHaveLength(4);
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['missing-subject', 'undeclared-measurement', 'unregistered-connector'])
    );
  });

  it('does not bypass an ambiguous declaration on a preferred source', () => {
    const input = enabled(
      [
        source('alpha', [observation('ambiguous', { code: { coding: [ASLEEP, SATURATION] } })]),
        source('beta', [observation('b')])
      ],
      'fallback'
    );
    const result = aggregate(input);
    const sleep = result.reconciliations.find(({ key }) => key === 'total-sleep-time');
    expect(sleep).toMatchObject({ outcome: 'abstained', reason: 'ambiguous-declaration' });
    expect(sleep?.attempts).toHaveLength(1);
    expect(derived(result.bundle)).toEqual([]);
  });

  it('reports the actual missing time on ambiguous declarations without leaking supplied codings', () => {
    const result = aggregate(
      enabled([
        source('alpha', [
          observation('ambiguous', { code: { coding: [ASLEEP, SATURATION] }, effectivePeriod: undefined })
        ])
      ])
    );
    expect(result.issues.map(({ code }) => code)).toContain('missing-time');
    expect(result.reconciliationStatus).toBe('no-occasions');
    expect(JSON.stringify(result.issues)).not.toContain(SYSTEM);
  });
});

describe('derived measurements and provenance', () => {
  it.each(['period', 'date-time', 'instant'] as const)(
    'preserves the selected %s and local offset while matching normalized windows',
    (kind) => {
      const local: Partial<Observation> =
        kind === 'period'
          ? {
              effectivePeriod: {
                id: 'source-period',
                start: '2026-06-21T00:00:00.000100+02:00',
                end: '2026-06-21T08:00:00+02:00'
              }
            }
          : {
              effectivePeriod: undefined,
              ...(kind === 'instant'
                ? { effectiveInstant: '2026-06-21T00:00:00.000100+02:00' }
                : { effectiveDateTime: '2026-06-21T00:00:00.000100+02:00' })
            };
      const normalized: Partial<Observation> =
        kind === 'period'
          ? { effectivePeriod: { start: '2026-06-20T22:00:00.0001Z', end: PERIOD.end } }
          : { effectivePeriod: undefined, effectiveDateTime: '2026-06-20T22:00:00.0001Z' };
      const reading = (id: string, time: Partial<Observation>) =>
        observation(id, {
          code: { coding: [SATURATION] },
          valueQuantity: { value: 98, system: SYSTEMS.UCUM, code: '%' },
          ...time
        });
      const input = enabled([source('alpha', [reading('local', local)]), source('beta', [reading('utc', normalized)])]);
      const before = structuredClone(input);
      const result = aggregate(input);
      const selected = derived(result.bundle)[0];
      expect(result.reconciliations).toHaveLength(1);
      expect(selected?.effectivePeriod).toEqual(local.effectivePeriod);
      expect(selected?.effectiveDateTime).toBe(local.effectiveDateTime);
      expect(selected?.effectiveInstant).toBe(local.effectiveInstant);
      expect(selected?.derivedFrom).toHaveLength(2);
      expect(input).toEqual(before);
    }
  );

  it.each([false, true])(
    'rebases retained metadata and contained references using the original RESTful base: component=%s',
    (component) => {
      const element = {
        code: {
          coding: [ASLEEP],
          extension: [{ url: 'https://example.test/context', valueReference: { reference: 'Device/source-context' } }]
        },
        valueQuantity: { value: 415, system: SYSTEMS.UCUM, code: 'min' }
      };
      const contained: FhirResource[] = [
        { resourceType: 'Device', id: 'sensor', owner: { reference: 'Organization/owner' } }
      ];
      const original = observation('rest-metadata', {
        code: component ? { coding: [PANEL] } : element.code,
        valueQuantity: component ? undefined : element.valueQuantity,
        component: component ? [element] : undefined,
        subject: { reference: 'Patient/person' },
        device: { reference: '#sensor' },
        performer: [{ reference: 'Practitioner/operator' }],
        specimen: { reference: 'Specimen/sample/_history/2' },
        contained
      });
      const input = enabled([restSource('alpha', 'https://source.test/fhir', [original])]);
      const before = structuredClone(input);
      const result = aggregate(input);
      const selected = derived(result.bundle)[0];
      expect(selected).toMatchObject({
        subject: { reference: 'https://source.test/fhir/Patient/person' },
        device: { reference: '#sensor' },
        performer: [{ reference: 'https://source.test/fhir/Practitioner/operator' }],
        specimen: { reference: 'https://source.test/fhir/Specimen/sample/_history/2' },
        contained: [
          { resourceType: 'Device', id: 'sensor', owner: { reference: 'https://source.test/fhir/Organization/owner' } }
        ]
      });
      expect(selected?.code.extension).toEqual([
        {
          url: 'https://example.test/context',
          valueReference: { reference: 'https://source.test/fhir/Device/source-context' }
        }
      ]);
      expect(result.bundle.entry?.[0]?.resource).toEqual(original);
      expect(input).toEqual(before);
    }
  );

  it('rejects unbased relative metadata instead of guessing from a matching resource id', () => {
    const original = observation('unbased-metadata', { device: { reference: 'Device/private-sensor-marker' } });
    expect(() => aggregate(enabled([source('alpha', [original])]))).toThrow(/Cannot preserve a relative reference/);
  });

  it('extracts only the selected component, keeps parent subject/time, and resolves every considered source', () => {
    const panel = observation('panel', {
      code: { coding: [PANEL] },
      identifier: [{ system: SYSTEM, value: 'source-business-id' }],
      valueQuantity: undefined,
      dataAbsentReason: ABSENT,
      interpretation: [{ text: 'parent-only' }],
      component: [
        { code: { coding: [IN_BED] }, valueQuantity: { value: 480, system: SYSTEMS.UCUM, code: 'min' } },
        {
          code: { coding: [ASLEEP] },
          valueQuantity: { value: 415, system: SYSTEMS.UCUM, code: 'min' },
          interpretation: [{ text: 'component-only' }]
        }
      ]
    });
    const input = enabled([source('alpha', [panel]), source('beta', [observation('b')])]);
    const before = structuredClone(input);
    const result = aggregate(input);
    const selected = derived(result.bundle)[0];
    expect(selected).toMatchObject({
      code: { coding: [ASLEEP] },
      valueQuantity: { value: 415 },
      subject: SUBJECT,
      effectivePeriod: PERIOD,
      interpretation: [{ text: 'component-only' }]
    });
    expect(selected?.component).toBeUndefined();
    expect(selected?.identifier).toBeUndefined();
    expect(selected?.dataAbsentReason).toBeUndefined();
    expect(selected?.derivedFrom).toHaveLength(2);
    const addresses = new Set(result.bundle.entry?.map(({ fullUrl }) => fullUrl));
    expect(selected?.derivedFrom?.every(({ reference }) => addresses.has(reference))).toBe(true);
    expect(input).toEqual(before);
    panel.component?.reverse();
    expect(derived(aggregate(input).bundle)).toEqual(derived(result.bundle));
  });

  it('uses original absolute source fullUrls rather than assuming UUID references', () => {
    const sources = [
      source('alpha', [observation('a', { id: 'reading-a' })]),
      source('beta', [observation('b', { id: 'reading-b' })])
    ];
    for (const [index, item] of sources.entries()) {
      const entry = item.bundle.entry?.[0];
      if (entry) entry.fullUrl = `https://example.test/${index}/Observation/${entry.resource?.id}`;
    }
    const result = aggregate(enabled(sources));
    expect(derived(result.bundle)[0]?.derivedFrom?.map(({ reference }) => reference)).toEqual(
      sources.map(({ bundle }) => bundle.entry?.[0]?.fullUrl).sort()
    );
  });

  it('retains per-entry provenance even when callers reuse the same resource object at distinct URLs', () => {
    const shared = observation('shared');
    const a = source('alpha', [shared]);
    const b = source('beta', [shared]);
    const aEntry = a.bundle.entry?.[0];
    const bEntry = b.bundle.entry?.[0];
    if (!aEntry || !bEntry) throw new Error('test setup');
    aEntry.fullUrl = 'https://alpha.example.test/Observation/shared';
    bEntry.fullUrl = 'https://beta.example.test/Observation/shared';
    const first = aggregate(enabled([a, b]));
    const second = aggregate(enabled([b, a]));
    expect(derived(first.bundle)).toEqual(derived(second.bundle));
    expect(derived(first.bundle)[0]?.derivedFrom).toEqual([
      { reference: aEntry.fullUrl },
      { reference: bEntry.fullUrl }
    ]);
  });

  it.each([false, true])(
    'preserves contained metadata and its transitive graph for component selection=%s',
    (component) => {
      const sleep = { code: { coding: [ASLEEP] }, valueQuantity: { value: 415, system: SYSTEMS.UCUM, code: 'min' } };
      const unrelated = {
        code: { coding: [IN_BED] },
        valueQuantity: { value: 480, system: SYSTEMS.UCUM, code: 'min' },
        extension: [{ url: 'https://example.test/related', valueReference: { reference: '#panel-only' } }]
      };
      const contained: FhirResource[] = [
        { resourceType: 'Patient', id: 'person', generalPractitioner: [{ reference: '#operator' }] },
        { resourceType: 'Device', id: 'sensor', owner: { reference: '#organization' } },
        {
          resourceType: 'Organization',
          id: 'organization',
          name: 'Synthetic organization',
          extension: [{ url: 'https://example.test/related', valueReference: { reference: '#sensor' } }]
        },
        { resourceType: 'Practitioner', id: 'operator' },
        { resourceType: 'Specimen', id: 'sample', subject: { reference: '#person' } },
        { resourceType: 'Observation', id: 'panel-only', status: 'final', code: { text: 'Synthetic panel context' } }
      ];
      const original = observation('contained', {
        code: component ? { coding: [PANEL] } : sleep.code,
        valueQuantity: component ? undefined : sleep.valueQuantity,
        component: component ? [unrelated, sleep] : [unrelated],
        subject: { reference: '#person' },
        device: { reference: '#sensor', display: '#display-is-not-a-reference' },
        performer: [{ reference: '#operator' }],
        specimen: { reference: '#sample' },
        contained
      });
      const input = enabled([source('alpha', [original])]);
      const before = structuredClone(input);
      const result = aggregate(input);
      const selected = derived(result.bundle)[0];
      expect(selected).toMatchObject({
        subject: original.subject,
        device: original.device,
        performer: original.performer,
        specimen: original.specimen,
        code: sleep.code,
        valueQuantity: sleep.valueQuantity
      });
      expect(selected?.contained).toHaveLength(5);
      expect(selected?.contained).toEqual(expect.arrayContaining(original.contained?.slice(0, 5) ?? []));
      expect(selected?.contained?.some(({ id }) => id === 'panel-only')).toBe(false);
      expect(selected?.component).toBeUndefined();
      expect(input).toEqual(before);
      const patient = selected?.contained?.find(({ resourceType }) => resourceType === 'Patient');
      if (!patient) throw new Error('test setup');
      patient.id = 'changed-only-in-derived';
      expect(input).toEqual(before);
      expect(result.bundle.entry?.[0]?.resource).toEqual(original);
    }
  );

  it('keeps a copied contained resource back-reference pointing at the original Observation', () => {
    const contained: FhirResource[] = [
      {
        resourceType: 'Device',
        id: 'sensor',
        extension: [{ url: 'https://example.test/source-observation', valueReference: { reference: '#' } }]
      }
    ];
    const original = observation('contained-back-reference', {
      device: { reference: '#sensor' },
      contained
    });
    const input = enabled([source('alpha', [original])]);
    const before = structuredClone(input);
    const selected = derived(aggregate(input).bundle)[0];
    expect(selected?.contained?.[0]).toMatchObject({
      extension: [
        {
          valueReference: { reference: `urn:uuid:${original.id}` }
        }
      ]
    });
    expect(input).toEqual(before);
  });

  it.each([false, true])(
    'rejects missing or ambiguous contained targets without exposing their ids: duplicate=%s',
    (duplicate) => {
      const original = observation('invalid-contained-reference', {
        device: { reference: '#private-target-marker' },
        contained: duplicate
          ? [
              { resourceType: 'Device', id: 'private-target-marker' },
              { resourceType: 'Device', id: 'private-target-marker' }
            ]
          : undefined
      });
      const input = enabled([source('alpha', [original])]);
      const before = structuredClone(input);
      expect(() => aggregate(input)).toThrow(/exactly one source target/);
      try {
        aggregate(input);
      } catch (error) {
        expect(error).toBeInstanceOf(ConnectorError);
        expect(String(error)).not.toContain('private-target-marker');
      }
      expect(input).toEqual(before);
    }
  );

  it('does not equate identical subject fragments in different containing Observations', () => {
    const localSubject = (id: string) =>
      observation(id, {
        subject: { reference: '#person' },
        contained: [{ resourceType: 'Patient', id: 'person' }]
      });
    expect(() =>
      aggregate(
        enabled([source('alpha', [localSubject('alpha-container')]), source('beta', [localSubject('beta-container')])])
      )
    ).toThrow(/different subjects/);
  });

  it('rejects unaddressable considered observations rather than minting broken provenance', () => {
    const input = enabled();
    const entry = input.sources[1]?.bundle.entry?.[0];
    if (entry) {
      entry.fullUrl = undefined;
      if (entry.resource) entry.resource.id = undefined;
    }
    expect(() => aggregate(input)).toThrow(/resolvable bundle address/);
  });

  it('requires an actual fullUrl for provenance rather than guessing relative reference resolution', () => {
    const input = enabled();
    const entry = input.sources[1]?.bundle.entry?.[0];
    if (entry) entry.fullUrl = undefined;
    expect(() => aggregate(input)).toThrow(/resolvable bundle address/);
  });

  it('changes derived identity when a different source is selected and remains reproducible', () => {
    const first = aggregate(enabled());
    const second = aggregate(enabled());
    const changed = aggregate(enabled(undefined, 'strict', ['beta', 'alpha']));
    expect(first).toEqual(second);
    expect(derived(changed.bundle)[0]?.id).not.toBe(derived(first.bundle)[0]?.id);
  });

  it('emits boolean false as a real value for a shared connector-declared concept', () => {
    const definition: MeasurementDefinition = {
      key: 'synthetic-flag',
      description: 'Synthetic flag for value-preservation testing.',
      valueType: 'boolean',
      context: { scope: 'reading' }
    };
    // Synthetic future shared definition, not a declaration of real connector capabilities.
    const catalogue = structuredClone(CATALOGUE);
    catalogue.entries = [
      {
        key: definition.key,
        definition,
        shared: true,
        sources: ['alpha', 'beta'].map((connector) => ({
          connector,
          declarations: [
            {
              key: definition.key,
              coding: ASLEEP,
              location: { kind: 'observation' },
              valueType: 'boolean',
              context: definition.context
            }
          ]
        }))
      }
    ];
    const input = options([
      source('alpha', [
        observation('false', {
          effectivePeriod: undefined,
          effectiveDateTime: PERIOD.end,
          valueQuantity: undefined,
          valueBoolean: false
        })
      ])
    ]);
    input.reconciliation = { enabled: true, catalogue, configuration: generateReconciliationConfiguration(catalogue) };
    expect(derived(aggregate(input).bundle)[0]?.valueBoolean).toBe(false);
  });

  it('reconciles an independently expected component value from the real Google Health mapper', () => {
    const { bundle } = buildBundleFromResponses(
      [
        {
          dataPoints: [
            {
              name: 'users/synthetic/dataTypes/sleep/dataPoints/synthetic-night',
              sleep: {
                interval: { startTime: PERIOD.start, endTime: PERIOD.end },
                summary: { minutesAsleep: '420', minutesInSleepPeriod: '480' }
              }
            }
          ]
        }
      ],
      { subjectKey: 'synthetic-person', subject: SUBJECT, timestamp: TIMESTAMP }
    );
    const catalogue = createMeasurementCatalogue([registration('alpha'), GOOGLE_HEALTH_MEASUREMENTS]);
    const configuration = generateReconciliationConfiguration(catalogue);
    configuration.measurements['total-sleep-time'] = {
      sourcePriority: ['google-health', 'alpha'],
      missingData: 'strict'
    };
    const result = aggregate({
      ...options([source('alpha', [observation('a')]), { bundle }]),
      reconciliation: { enabled: true, catalogue, configuration }
    });
    const selected = derived(result.bundle)[0];
    expect(selected?.valueQuantity).toMatchObject({ value: 420, system: SYSTEMS.UCUM, code: 'min' });
    expect(selected?.code.coding?.some(({ code }) => code === '93832-4')).toBe(true);
    expect(selected?.component).toBeUndefined();
    expect(selected?.derivedFrom).toHaveLength(2);
  });

  it('keeps validator fixtures exercising configured derivation and the disabled path', () => {
    const configured = aggregateBundle();
    const basic = aggregateBundle(false);
    expect(derived(configured)).toHaveLength(1);
    expect(derived(configured)[0]?.valueQuantity?.value).toBe(402);
    expect(derived(configured)[0]?.derivedFrom).toHaveLength(2);
    expect(derived(configured)[0]?.device).toEqual({ reference: '#sensor' });
    expect(derived(configured)[0]?.contained).toEqual([{ resourceType: 'Device', id: 'sensor' }]);
    expect(derived(basic)).toEqual([]);
    expect(configured.entry).toHaveLength(6);
    expect(basic.entry).toHaveLength(5);
  });

  it('keeps the validator fixture exercising contained subjects and transitive device references', () => {
    const bundle = aggregateContainedBundle();
    const selected = derived(bundle)[0];
    expect(bundle.entry).toHaveLength(2);
    expect(selected?.subject).toEqual({ reference: '#person' });
    expect(selected?.device).toEqual({ reference: '#sensor' });
    expect(selected?.contained).toHaveLength(3);
    expect(selected?.contained).toEqual(
      expect.arrayContaining([
        { resourceType: 'Patient', id: 'person' },
        { resourceType: 'Device', id: 'sensor', owner: { reference: '#organization' } },
        { resourceType: 'Organization', id: 'organization', name: 'Synthetic organization' }
      ])
    );
  });

  it('keeps the validator fixture exercising rebased links and the selected local period', () => {
    const bundle = aggregateRelativeBundle();
    const selected = derived(bundle)[0];
    expect(bundle.entry).toHaveLength(6);
    expect(selected).toMatchObject({
      subject: { reference: 'https://example.test/fhir/Patient/person' },
      performer: [{ reference: 'https://example.test/fhir/Practitioner/operator' }],
      specimen: { reference: 'https://example.test/fhir/Specimen/sample' },
      effectivePeriod: { start: '2026-06-21T00:00:00+02:00', end: '2026-06-21T08:00:00+02:00' },
      contained: [
        {
          resourceType: 'Device',
          id: 'sensor',
          owner: { reference: 'https://example.test/fhir/Organization/owner' }
        }
      ]
    });
  });
});
