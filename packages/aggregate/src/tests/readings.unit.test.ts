// Hand-authored synthetic FHIR data for this test suite, contributed under the repository's MIT licence.
import {
  declareMeasurement,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  SYSTEMS
} from '@open-twin/fhir-core';
import { buildBundleFromResponses, GOOGLE_HEALTH_MEASUREMENTS } from '@open-twin/provider-google-health';
import { OURA_MEASUREMENTS } from '@open-twin/provider-oura';
import type { Bundle, Observation } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import type { SourceBundle } from '../aggregate';
import { createMeasurementCatalogue } from '../catalogue';
import { type ReadingIneligibility, type ReadingRequest, resolveReadings } from '../readings';

const SYSTEM = 'https://example.test/measurements';
const ASLEEP = { system: SYSTEM, code: 'asleep' };
const IN_BED = { system: SYSTEM, code: 'in-bed' };
const PANEL = { system: SYSTEM, code: 'sleep-panel' };
const SUBJECT = 'Patient/synthetic-person';
const PERIOD = { start: '2026-06-20T22:00:00Z', end: '2026-06-21T06:00:00Z' };
const ABSENT = { coding: [{ system: SYSTEMS.DATA_ABSENT_REASON, code: 'unknown' }] };
const REQUEST: ReadingRequest = {
  key: 'total-sleep-time',
  subject: SUBJECT,
  context: { scope: 'sleep-period', statistic: 'total' },
  window: { kind: 'period', ...PERIOD }
};

function registration(connector: string): MeasurementDeclarationSet {
  const panel: MeasurementDefinition = {
    key: `${connector}:sleep-panel`,
    description: 'Synthetic value-less panel for a sleep period.',
    valueType: 'none',
    context: { scope: 'sleep-period' }
  };
  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    connector,
    version: 1,
    coverage: 'complete',
    definitions: [panel],
    declarations: [
      declareMeasurement(panel, PANEL),
      declareMeasurement('total-sleep-time', ASLEEP),
      declareMeasurement('total-sleep-time', ASLEEP, PANEL),
      declareMeasurement('time-in-bed', IN_BED, PANEL)
    ]
  };
}

const CATALOGUE = createMeasurementCatalogue([registration('alpha'), registration('beta')]);

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    resourceType: 'Observation',
    status: 'final',
    code: { coding: [ASLEEP] },
    subject: { reference: SUBJECT },
    effectivePeriod: { ...PERIOD },
    valueQuantity: { value: 420, system: SYSTEMS.UCUM, code: 'min' },
    ...overrides
  };
}

function source(observations: Observation[], connector = 'alpha'): SourceBundle {
  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: observations.map((resource) => ({ resource }))
  };
  return { connector, bundle };
}

function resolve(value: Observation, request = REQUEST) {
  return resolveReadings({ catalogue: CATALOGUE, sources: [source([value])], request });
}

function reasons(value: Observation, request = REQUEST): ReadingIneligibility[] {
  const eligibility = resolve(value, request).readings[0]?.eligibility;
  expect(eligibility?.kind).toBe('ineligible');
  return eligibility?.kind === 'ineligible' ? eligibility.reasons : [];
}

describe('declaration-driven runtime resolution', () => {
  it('resolves a registered observation-level coding absent from the legacy hardcoded table', () => {
    const value = observation();
    const result = resolve(value);
    expect(result.issues).toEqual([]);
    expect(result.readings).toHaveLength(1);
    expect(result.readings[0]?.eligibility).toEqual({ kind: 'eligible' });
    expect(result.readings[0]?.reading).toMatchObject({
      connector: 'alpha',
      declaration: { key: 'total-sleep-time', location: { kind: 'observation' } }
    });
    expect(result.readings[0]?.reading.observation).toBe(value);
  });

  it('locates components by their coding and parent coding, independent of order', () => {
    const asleep = { code: { coding: [ASLEEP] }, valueQuantity: { value: 420, system: SYSTEMS.UCUM, code: 'min' } };
    const inBed = { code: { coding: [IN_BED] }, valueQuantity: { value: 480, system: SYSTEMS.UCUM, code: 'min' } };
    const panel = observation({
      code: { coding: [PANEL] },
      valueQuantity: undefined,
      component: [inBed, asleep],
      dataAbsentReason: ABSENT
    });
    const forward = resolve(panel);
    const reverse = resolve({ ...panel, component: [asleep, inBed] });
    expect(forward.issues).toEqual([]);
    expect(forward.readings).toHaveLength(1);
    expect(forward.readings[0]?.eligibility).toEqual({ kind: 'eligible' });
    expect(reverse.readings).toEqual(
      forward.readings.map((item) => ({
        ...item,
        reading: { ...item.reading, observation: { ...panel, component: [asleep, inBed] } }
      }))
    );
    expect(forward.readings[0]?.reading.component).toBe(asleep);

    const wrongParent = resolve({ ...panel, code: { coding: [{ system: SYSTEM, code: 'other-panel' }] } });
    expect(wrongParent.readings).toEqual([]);
    expect(wrongParent.issues.map((issue) => issue.code)).toEqual([
      'undeclared-measurement',
      'undeclared-measurement',
      'undeclared-measurement'
    ]);
  });

  it('keeps time in bed distinct from time asleep', () => {
    const value = observation({
      code: { coding: [PANEL] },
      valueQuantity: undefined,
      component: [{ code: { coding: [IN_BED] }, valueQuantity: { value: 480, system: SYSTEMS.UCUM, code: 'min' } }]
    });
    expect(resolve(value).readings).toEqual([]);
    const result = resolve(value, { ...REQUEST, key: 'time-in-bed' });
    expect(result.readings[0]?.reading.declaration.key).toBe('time-in-bed');
  });

  it('does not silently skip ambiguity between declarations for different keys', () => {
    const set = registration('alpha');
    set.declarations.push(declareMeasurement('time-in-bed', { system: SYSTEM, code: 'alias' }));
    const catalogue = createMeasurementCatalogue([set]);
    const result = resolveReadings({
      catalogue,
      sources: [source([observation({ code: { coding: [ASLEEP, { system: SYSTEM, code: 'alias' }] } })])],
      request: REQUEST
    });
    expect(result.readings).toEqual([]);
    expect(result.issues).toEqual([
      {
        code: 'ambiguous-declaration',
        matchedKeys: ['time-in-bed', 'total-sleep-time'],
        sourceIndex: 0,
        observationIndex: 0,
        location: 'observation'
      }
    ]);
  });

  it('deduplicates matched keys without hiding ambiguity between declarations for the same key', () => {
    const set = registration('alpha');
    const alias = { system: SYSTEM, code: 'alias' };
    set.declarations.push(declareMeasurement('total-sleep-time', alias));
    const result = resolveReadings({
      catalogue: createMeasurementCatalogue([set]),
      sources: [source([observation({ code: { coding: [ASLEEP, alias] } })])],
      request: REQUEST
    });
    expect(result.readings).toEqual([]);
    expect(result.issues).toEqual([
      {
        code: 'ambiguous-declaration',
        matchedKeys: ['total-sleep-time'],
        sourceIndex: 0,
        observationIndex: 0,
        location: 'observation'
      }
    ]);
  });

  it('reports ambiguous component codings instead of choosing one', () => {
    const result = resolve(
      observation({
        code: { coding: [PANEL] },
        valueQuantity: undefined,
        component: [
          { code: { coding: [ASLEEP, IN_BED] }, valueQuantity: { value: 420, system: SYSTEMS.UCUM, code: 'min' } }
        ]
      })
    );
    expect(result.readings).toEqual([]);
    expect(result.issues).toEqual([
      {
        code: 'ambiguous-declaration',
        matchedKeys: ['time-in-bed', 'total-sleep-time'],
        sourceIndex: 0,
        observationIndex: 0,
        location: 'component'
      }
    ]);
  });

  it('keeps every same-source reading for the selection layer to handle', () => {
    const first = observation();
    const second = observation({ valueQuantity: { value: 430, system: SYSTEMS.UCUM, code: 'min' } });
    const result = resolveReadings({ catalogue: CATALOGUE, sources: [source([first, second])], request: REQUEST });
    expect(result.readings).toHaveLength(2);
    expect(result.readings.every((item) => item.eligibility.kind === 'eligible')).toBe(true);
    expect(result.readings.map((item) => item.reading.observation)).toEqual([first, second]);
  });

  it('does not silently choose between repeated components with the same coding', () => {
    const component = {
      code: { coding: [ASLEEP] },
      valueQuantity: { value: 420, system: SYSTEMS.UCUM, code: 'min' }
    };
    const result = resolve(
      observation({
        code: { coding: [PANEL] },
        valueQuantity: undefined,
        component: [component, { ...component, valueQuantity: { ...component.valueQuantity, value: 430 } }]
      })
    );
    expect(result.readings).toHaveLength(2);
    expect(result.readings.every((item) => item.eligibility.kind === 'eligible')).toBe(true);
  });

  it('reports unregistered sources and unmatched codes without assuming capability', () => {
    const result = resolveReadings({
      catalogue: CATALOGUE,
      sources: [source([observation()], 'unregistered'), source([observation({ code: { coding: [IN_BED] } })])],
      request: REQUEST
    });
    expect(result.readings).toEqual([]);
    expect(result.issues).toEqual([
      { code: 'unregistered-connector', matchedKeys: [], sourceIndex: 0 },
      {
        code: 'undeclared-measurement',
        matchedKeys: [],
        sourceIndex: 1,
        observationIndex: 0,
        location: 'observation'
      }
    ]);
  });

  it('retains the declared shared capability when only one source or neither returns data', () => {
    const before = structuredClone(CATALOGUE);
    const result = resolveReadings({
      catalogue: CATALOGUE,
      sources: [source([observation()]), source([], 'beta')],
      request: REQUEST
    });
    expect(result.readings.map((item) => item.reading.connector)).toEqual(['alpha']);
    expect(resolveReadings({ catalogue: CATALOGUE, sources: [], request: REQUEST })).toEqual({
      readings: [],
      issues: []
    });
    expect(CATALOGUE).toEqual(before);
  });

  it('uses the same connector-tag attribution as aggregation and preserves source resources', () => {
    const tagged = source([observation()]);
    tagged.connector = undefined;
    tagged.bundle.meta = { tag: [{ system: 'http://opentwin.ch/fhir/CodeSystem/connector', code: 'alpha' }] };
    const before = structuredClone(tagged);
    expect(resolveReadings({ catalogue: CATALOGUE, sources: [tagged], request: REQUEST }).readings).toHaveLength(1);
    expect(tagged).toEqual(before);
    tagged.bundle.meta = undefined;
    expect(() => resolveReadings({ catalogue: CATALOGUE, sources: [tagged], request: REQUEST })).toThrow(
      /Cannot attribute/
    );
  });

  it('resolves sleep components using real Oura and Google Health declarations', () => {
    const catalogue = createMeasurementCatalogue([OURA_MEASUREMENTS, GOOGLE_HEALTH_MEASUREMENTS]);
    const sources = [OURA_MEASUREMENTS, GOOGLE_HEALTH_MEASUREMENTS].map((set) => {
      const declaration = set.declarations.find((item) => item.key === 'total-sleep-time');
      expect(declaration?.location.kind).toBe('component');
      if (declaration?.location.kind !== 'component') throw new Error('Expected sleep component declaration');
      return source(
        [
          observation({
            code: { coding: [declaration.location.parent] },
            valueQuantity: undefined,
            component: [
              {
                code: { coding: [declaration.coding] },
                valueQuantity: { value: 420, system: SYSTEMS.UCUM, code: 'min' }
              }
            ]
          })
        ],
        set.connector
      );
    });
    const result = resolveReadings({ catalogue, sources, request: REQUEST });
    expect(result.readings.map((item) => [item.reading.connector, item.eligibility.kind])).toEqual([
      ['oura', 'eligible'],
      ['google-health', 'eligible']
    ]);
  });

  it('resolves independently expected values from a real Google Health mapper and bundle builder', () => {
    const { bundle, unmapped } = buildBundleFromResponses(
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
      { subjectKey: 'synthetic-person', subject: { reference: SUBJECT }, timestamp: PERIOD.end }
    );
    const before = structuredClone(bundle);
    const catalogue = createMeasurementCatalogue([GOOGLE_HEALTH_MEASUREMENTS]);
    const result = resolveReadings({ catalogue, sources: [{ bundle }], request: REQUEST });
    expect(unmapped).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.readings).toHaveLength(1);
    expect(result.readings[0]?.eligibility).toEqual({ kind: 'eligible' });
    expect(result.readings[0]?.reading.component).toMatchObject({
      code: { coding: [{ system: SYSTEMS.LOINC, code: '93832-4' }] },
      valueQuantity: { value: 420, system: SYSTEMS.UCUM, code: 'min' }
    });
    const inBed = resolveReadings({ catalogue, sources: [{ bundle }], request: { ...REQUEST, key: 'time-in-bed' } });
    expect(inBed.readings[0]?.reading.component?.valueQuantity?.value).toBe(480);
    expect(bundle).toEqual(before);
  });
});

describe('observation status eligibility', () => {
  it.each(['entered-in-error', 'cancelled', 'registered'] satisfies Observation['status'][])(
    'does not use a %s observation even when a value is present',
    (status) => {
      expect(reasons(observation({ status }))).toContain('unusable-status');
    }
  );

  it.each(['preliminary', 'final', 'amended', 'corrected', 'unknown'] satisfies Observation['status'][])(
    'does not reject an otherwise usable %s result solely for its status',
    (status) => {
      expect(resolve(observation({ status })).readings[0]?.eligibility).toEqual({ kind: 'eligible' });
    }
  );

  it('applies the parent status to component-level results', () => {
    const result = resolve(
      observation({
        status: 'entered-in-error',
        code: { coding: [PANEL] },
        valueQuantity: undefined,
        component: [{ code: { coding: [ASLEEP] }, valueQuantity: { value: 420, system: SYSTEMS.UCUM, code: 'min' } }]
      })
    );
    expect(result.readings[0]?.eligibility).toEqual({ kind: 'ineligible', reasons: ['unusable-status'] });
  });
});

describe('required values and emitted units', () => {
  it('does not confuse a valid zero with missing data', () => {
    expect(
      resolve(observation({ valueQuantity: { value: 0, system: SYSTEMS.UCUM, code: 'min' } })).readings[0]?.eligibility
    ).toEqual({ kind: 'eligible' });
  });

  it.each([{ valueQuantity: undefined }, { valueQuantity: { system: SYSTEMS.UCUM, code: 'min' } }])(
    'rejects missing required numeric values: %j',
    (overrides) => {
      expect(reasons(observation(overrides))).toContain('missing-value');
    }
  );

  it('rejects dataAbsentReason even if an inconsistent value is also present', () => {
    expect(reasons(observation({ dataAbsentReason: ABSENT }))).toContain('data-absent');
    expect(reasons(observation({ valueQuantity: undefined, dataAbsentReason: ABSENT }))).toContain('data-absent');
  });

  it('checks component-level absence rather than the parent score', () => {
    const result = resolve(
      observation({
        code: { coding: [PANEL] },
        component: [{ code: { coding: [ASLEEP] }, dataAbsentReason: ABSENT }]
      })
    );
    expect(result.readings[0]?.eligibility).toEqual({ kind: 'ineligible', reasons: ['data-absent'] });
  });

  it.each([{ valueQuantity: undefined, valueString: '420' }, { valueString: '420' }])(
    'rejects a wrong or multiple value[x] types: %j',
    (overrides) => {
      expect(reasons(observation(overrides))).toContain('value-type-mismatch');
    }
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects a nonfinite numeric value',
    (value) => {
      expect(reasons(observation({ valueQuantity: { value, system: SYSTEMS.UCUM, code: 'min' } }))).toContain(
        'invalid-value'
      );
    }
  );

  it('does not treat a quantity comparator as an exact reading', () => {
    expect(
      reasons(observation({ valueQuantity: { value: 420, comparator: '<', system: SYSTEMS.UCUM, code: 'min' } }))
    ).toContain('invalid-value');
  });

  it.each([
    { value: 25200, system: SYSTEMS.UCUM, code: 's' },
    { value: 420, unit: 'min' },
    { value: 420, system: SYSTEM, code: 'min' },
    { value: 420, system: SYSTEMS.UCUM }
  ])('requires the declared UCUM unit, without implicit conversion: %j', (valueQuantity) => {
    const value = observation({ valueQuantity });
    expect(reasons(value)).toContain('unit-mismatch');
    expect(value.valueQuantity).toEqual(valueQuantity);
  });
});

describe('context and subject compatibility', () => {
  it.each([
    { scope: 'daily' as const, statistic: 'total' as const },
    { scope: 'sleep-period' as const, statistic: 'mean' as const }
  ])('rejects a different requested scope or statistic', (context) => {
    expect(reasons(observation(), { ...REQUEST, context })).toContain('context-mismatch');
  });

  it('requires a period for a sleep summary, even when two instants match', () => {
    const value = observation({ effectivePeriod: undefined, effectiveDateTime: PERIOD.start });
    expect(reasons(value, { ...REQUEST, window: { kind: 'instant', at: PERIOD.start } })).toEqual(['context-mismatch']);
  });

  it('does not infer identity between different FHIR subject references', () => {
    expect(reasons(observation({ subject: { reference: 'urn:uuid:synthetic-person' } }))).toContain('subject-mismatch');
  });

  it('checks each source against the requested subject rather than grouping by key and date', () => {
    const result = resolveReadings({
      catalogue: CATALOGUE,
      sources: [
        source([observation()]),
        source([observation({ subject: { reference: 'Patient/different-synthetic-person' } })], 'beta')
      ],
      request: REQUEST
    });
    expect(result.readings.map((item) => item.eligibility)).toEqual([
      { kind: 'eligible' },
      { kind: 'ineligible', reasons: ['subject-mismatch'] }
    ]);
  });

  it('rejects a declaration whose context no longer matches its catalogue definition', () => {
    const catalogue = createMeasurementCatalogue([registration('alpha')]);
    const declaration = catalogue.entries.find((entry) => entry.key === REQUEST.key)?.sources[0]?.declarations[0];
    if (!declaration) throw new Error('Expected registered sleep declaration');
    declaration.context = { scope: 'daily', statistic: 'total' };
    const result = resolveReadings({ catalogue, sources: [source([observation()])], request: REQUEST });
    expect(result.readings[0]?.eligibility).toEqual({ kind: 'ineligible', reasons: ['context-mismatch'] });
  });

  it.each([undefined, {}, { display: 'Synthetic person' }, { reference: '' }])(
    'requires an explicit subject reference',
    (subject) => {
      expect(reasons(observation({ subject }))).toContain('missing-subject');
    }
  );
});

describe('conservative time compatibility', () => {
  it('normalizes negative offsets across midnight', () => {
    const value = observation({
      effectivePeriod: { start: '2026-06-20T17:00:00-05:00', end: '2026-06-20T23:00:00-07:00' }
    });
    expect(resolve(value).readings[0]?.eligibility).toEqual({ kind: 'eligible' });
  });

  it.each(['2024-02-29', '2000-02-29'])('accepts a real leap day: %s', (date) => {
    const effectivePeriod = { start: `${date}T00:00:00Z`, end: `${date}T01:00:00Z` };
    expect(
      resolve(observation({ effectivePeriod }), {
        ...REQUEST,
        window: { kind: 'period', ...effectivePeriod }
      }).readings[0]?.eligibility
    ).toEqual({ kind: 'eligible' });
  });

  it('compares complete boundaries with timezone normalization and fractional precision', () => {
    const value = observation({
      effectivePeriod: { start: '2026-06-21T00:00:00.000+02:00', end: '2026-06-21T08:00:00+02:00' }
    });
    expect(resolve(value).readings[0]?.eligibility).toEqual({ kind: 'eligible' });
  });

  it.each([
    { start: '2026-06-20T22:00:01Z', end: PERIOD.end },
    { start: PERIOD.start, end: '2026-06-21T06:00:01Z' },
    { start: '2026-06-20T23:00:00Z', end: '2026-06-21T05:00:00Z' },
    { start: '2026-06-20T12:00:00Z', end: '2026-06-20T13:00:00Z' },
    { start: '2026-06-20T22:00:00.0001Z', end: PERIOD.end }
  ])('rejects merely overlapping or same-date periods: %j', (effectivePeriod) => {
    expect(reasons(observation({ effectivePeriod }))).toContain('time-window-mismatch');
  });

  it.each([
    {},
    { start: PERIOD.start },
    { end: PERIOD.end },
    { start: PERIOD.end, end: PERIOD.start },
    { start: PERIOD.start, end: PERIOD.start },
    { start: '2026-06-20', end: '2026-06-21' },
    { start: '2026-02-30T22:00:00Z', end: PERIOD.end },
    { start: '2026-02-29T22:00:00Z', end: PERIOD.end },
    { start: '1900-02-29T22:00:00Z', end: PERIOD.end },
    { start: '2026-04-31T22:00:00Z', end: PERIOD.end },
    { start: '2026-06-20T24:00:00Z', end: PERIOD.end },
    { start: '2026-06-20T22:60:00Z', end: PERIOD.end },
    { start: '2026-06-20T22:00:60Z', end: PERIOD.end },
    { start: '2026-06-20T22:00:00+14:01', end: PERIOD.end },
    { start: '2026-06-20T22:00:00-15:00', end: PERIOD.end },
    { start: '2026-06-20T22:00:00+00:60', end: PERIOD.end },
    { start: '2026-06-20T22:00:00', end: PERIOD.end }
  ])('rejects incomplete or invalid periods: %j', (effectivePeriod) => {
    expect(reasons(observation({ effectivePeriod }))).toContain('invalid-time');
  });

  it('requires effective time and refuses ambiguous effective[x] choices', () => {
    expect(reasons(observation({ effectivePeriod: undefined }))).toContain('missing-time');
    expect(reasons(observation({ effectiveDateTime: PERIOD.start }))).toContain('invalid-time');
    expect(reasons(observation({ effectivePeriod: undefined, effectiveTiming: { event: [PERIOD.start] } }))).toContain(
      'invalid-time'
    );
  });

  it('does not equate an instant and a period starting at that instant', () => {
    expect(reasons(observation({ effectivePeriod: undefined, effectiveDateTime: PERIOD.start }))).toContain(
      'time-window-mismatch'
    );
  });
});

describe('instant readings and non-quantity values', () => {
  const AT = '2026-06-20T12:00:00.0001Z';
  const key = 'alpha:synthetic-value';

  function resolveType(
    valueType: MeasurementDefinition['valueType'],
    values: Partial<Observation>,
    location: 'observation' | 'component' = 'observation'
  ) {
    const definition: MeasurementDefinition = {
      key,
      description: 'Synthetic test value.',
      valueType,
      context: { scope: 'reading' }
    };
    const set: MeasurementDeclarationSet = {
      ...registration('alpha'),
      definitions: [definition],
      declarations: [declareMeasurement(definition, ASLEEP, location === 'component' ? PANEL : undefined)]
    };
    return resolveReadings({
      catalogue: createMeasurementCatalogue([set]),
      sources: [
        source([
          observation({
            effectivePeriod: undefined,
            effectiveDateTime: AT,
            valueQuantity: undefined,
            ...(location === 'component'
              ? { code: { coding: [PANEL] }, component: [{ code: { coding: [ASLEEP] }, ...values }] }
              : values)
          })
        ])
      ],
      request: { key, subject: SUBJECT, context: { scope: 'reading' }, window: { kind: 'instant', at: AT } }
    }).readings[0]?.eligibility;
  }

  it.each([
    ['boolean', { valueBoolean: false }],
    ['integer', { valueInteger: 0 }],
    ['string', { valueString: 'synthetic' }],
    ['codeable-concept', { valueCodeableConcept: { text: 'synthetic' } }],
    ['range', { valueRange: { low: { value: 0 } } }],
    ['ratio', { valueRatio: { numerator: { value: 0 }, denominator: { value: 1 } } }],
    ['sampled-data', { valueSampledData: { origin: { value: 0 }, period: 1, dimensions: 1, data: '0' } }],
    ['time', { valueTime: '12:00:00' }],
    ['date-time', { valueDateTime: AT }],
    ['period', { valuePeriod: { start: PERIOD.start, end: PERIOD.end } }]
  ] satisfies [MeasurementDefinition['valueType'], Partial<Observation>][])(
    'accepts a present %s value',
    (type, values) => {
      expect(resolveType(type, values)).toEqual({ kind: 'eligible' });
    }
  );

  it.each([
    ['codeable-concept', { valueCodeableConcept: {} }],
    ['range', { valueRange: {} }],
    ['period', { valuePeriod: {} }],
    ['quantity', { valueQuantity: {} }],
    ['none', {}]
  ] satisfies [MeasurementDefinition['valueType'], Partial<Observation>][])(
    'rejects an empty %s value',
    (type, values) => {
      expect(resolveType(type, values)).toEqual({ kind: 'ineligible', reasons: ['missing-value'] });
    }
  );

  it('normalizes offsets but never truncates distinct sub-millisecond instants', () => {
    expect(
      resolveType('boolean', { valueBoolean: false, effectiveDateTime: '2026-06-20T14:00:00.000100+02:00' })
    ).toEqual({ kind: 'eligible' });
    expect(resolveType('boolean', { valueBoolean: false, effectiveDateTime: '2026-06-20T12:00:00.0002Z' })).toEqual({
      kind: 'ineligible',
      reasons: ['time-window-mismatch']
    });
  });

  it('supports effectiveInstant but does not expand date-only markers into measurement windows', () => {
    expect(resolveType('boolean', { valueBoolean: true, effectiveDateTime: undefined, effectiveInstant: AT })).toEqual({
      kind: 'eligible'
    });
    expect(resolveType('boolean', { valueBoolean: true, effectiveDateTime: '2026-06-20' })).toEqual({
      kind: 'ineligible',
      reasons: ['invalid-time']
    });
  });

  it.each([-2147483648, 2147483647])('accepts the FHIR integer boundary %s', (valueInteger) => {
    expect(resolveType('integer', { valueInteger })).toEqual({ kind: 'eligible' });
  });

  it.each([-2147483649, 2147483648, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid integer %s',
    (valueInteger) => {
      expect(resolveType('integer', { valueInteger })).toEqual({ kind: 'ineligible', reasons: ['invalid-value'] });
    }
  );

  it('accepts an explicitly unitless quantity without inventing a unit', () => {
    expect(resolveType('quantity', { valueQuantity: { value: 0 } })).toEqual({ kind: 'eligible' });
  });

  it.each([{ code: 'min' }, { system: SYSTEMS.UCUM }, { unit: 'minutes' }])(
    'rejects an undeclared unit on a unitless quantity: %j',
    (unit) => {
      expect(resolveType('quantity', { valueQuantity: { value: 1, ...unit } })).toEqual({
        kind: 'ineligible',
        reasons: ['unit-mismatch']
      });
    }
  );

  it.each([
    ['range', { valueRange: { low: { value: 10 }, high: { value: 1 } } }],
    ['range', { valueRange: { low: { value: Number.NaN }, high: { value: 1 } } }],
    ['ratio', { valueRatio: { numerator: { value: 1 }, denominator: { value: 0 } } }],
    ['ratio', { valueRatio: { numerator: { value: 1 } } }],
    ['ratio', { valueRatio: { numerator: { value: Number.NaN }, denominator: { value: 1 } } }],
    ['time', { valueTime: 'not-a-time' }],
    ['time', { valueTime: '24:00:00' }],
    ['time', { valueTime: '12:60:00' }],
    ['time', { valueTime: '12:00' }],
    ['time', { valueTime: '12:00:00Z' }],
    ['date-time', { valueDateTime: 'not-a-date' }],
    ['date-time', { valueDateTime: '2026-02-29' }],
    ['date-time', { valueDateTime: '2026-13' }],
    ['date-time', { valueDateTime: '0000' }],
    ['date-time', { valueDateTime: '2026-06-20T12:00:00' }],
    ['period', { valuePeriod: { start: 'not-a-date' } }],
    ['period', { valuePeriod: { end: 'not-a-date' } }],
    ['period', { valuePeriod: { start: PERIOD.end, end: PERIOD.start } }],
    ['period', { valuePeriod: { start: '2026-06-21', end: '2026-06-20' } }],
    ['period', { valuePeriod: { start: '2027', end: PERIOD.end } }],
    ['period', { valuePeriod: { start: PERIOD.start, end: '2025' } }]
  ] satisfies [MeasurementDefinition['valueType'], Partial<Observation>][])(
    'rejects a malformed %s value: %j',
    (type, values) => {
      expect(resolveType(type, values)).toEqual({ kind: 'ineligible', reasons: ['invalid-value'] });
    }
  );

  it.each([
    ['range', { valueRange: { low: { value: 1 }, high: { value: 1 } } }],
    ['range', { valueRange: { high: { value: 0 } } }],
    ['time', { valueTime: '00:00:00.0001' }],
    ['date-time', { valueDateTime: '2026' }],
    ['date-time', { valueDateTime: '2026-06' }],
    ['date-time', { valueDateTime: '2024-02-29' }],
    ['period', { valuePeriod: { start: '2026' } }],
    ['period', { valuePeriod: { end: '2026-06' } }],
    ['period', { valuePeriod: { start: '2026-06-20', end: '2026-06-20' } }],
    ['period', { valuePeriod: { start: '2026-06', end: '2026' } }],
    ['period', { valuePeriod: { start: '2026', end: PERIOD.end } }],
    ['period', { valuePeriod: { start: PERIOD.start, end: '2026' } }],
    ['period', { valuePeriod: { start: '2026-06-20T14:00:00+02:00', end: '2026-06-20T12:00:00Z' } }],
    ['period', { valuePeriod: { start: AT, end: AT } }]
  ] satisfies [MeasurementDefinition['valueType'], Partial<Observation>][])(
    'preserves a valid %s value: %j',
    (type, values) => {
      expect(resolveType(type, values)).toEqual({ kind: 'eligible' });
    }
  );

  it('does not silently compare range bounds expressed in different units', () => {
    expect(
      resolveType('range', {
        valueRange: {
          low: { value: 100, system: SYSTEMS.UCUM, code: 'cm' },
          high: { value: 2, system: SYSTEMS.UCUM, code: 'm' }
        }
      })
    ).toEqual({ kind: 'ineligible', reasons: ['unit-mismatch'] });
  });

  const SAMPLED = { origin: { value: 0 }, period: 1, dimensions: 1, data: '0' };

  it.each([
    { system: SYSTEMS.UCUM, code: 'cm' },
    { system: SYSTEMS.UCUM, code: 'm' },
    { unit: 'centimeters' },
    { system: SYSTEMS.UCUM },
    { code: 'cm' }
  ])('rejects undeclared nested units at both value locations: %j', (unit) => {
    const quantity = { value: 1, ...unit };
    const cases: [MeasurementDefinition['valueType'], Partial<Observation>][] = [
      ['range', { valueRange: { low: quantity, high: { ...quantity, value: 2 } } }],
      ['range', { valueRange: { low: quantity } }],
      ['range', { valueRange: { high: quantity } }],
      ['ratio', { valueRatio: { numerator: quantity, denominator: { value: 1 } } }],
      ['ratio', { valueRatio: { numerator: { value: 1 }, denominator: quantity } }],
      ['sampled-data', { valueSampledData: { ...SAMPLED, origin: quantity } }]
    ];
    for (const location of ['observation', 'component'] as const) {
      for (const [type, values] of cases) {
        expect(resolveType(type, values, location)).toEqual({ kind: 'ineligible', reasons: ['unit-mismatch'] });
      }
    }
  });

  it('preserves unitless complex values in components', () => {
    const cases: [MeasurementDefinition['valueType'], Partial<Observation>][] = [
      ['range', { valueRange: { low: { value: 0 }, high: { value: 1 } } }],
      ['ratio', { valueRatio: { numerator: { value: 0 }, denominator: { value: 1 } } }],
      ['sampled-data', { valueSampledData: SAMPLED }]
    ];
    for (const [type, values] of cases) {
      expect(resolveType(type, values, 'component')).toEqual({ kind: 'eligible' });
    }
  });

  it.each([
    { period: 0 },
    { period: -1 },
    { period: Number.NaN },
    { dimensions: 0 },
    { dimensions: 1.5 },
    { dimensions: 2147483648 },
    { dimensions: 2, data: '0 1 2' },
    { data: 'not-a-sample' },
    { data: 'NaN' },
    { data: 'Infinity' },
    { data: '0  1' },
    { data: '0\t1' },
    { data: '0 L' },
    { data: '0 U' },
    { data: '0 L', upperLimit: 1 },
    { data: '0 U', lowerLimit: -1 },
    { factor: Number.POSITIVE_INFINITY },
    { lowerLimit: 2, upperLimit: 1 }
  ])('rejects invalid sampled-data parameters: %j', (overrides) => {
    expect(resolveType('sampled-data', { valueSampledData: { ...SAMPLED, ...overrides } })).toEqual({
      kind: 'ineligible',
      reasons: ['invalid-value']
    });
  });

  it('accepts interlaced samples and FHIR error/limit tokens alongside numeric values', () => {
    expect(
      resolveType('sampled-data', {
        valueSampledData: { ...SAMPLED, dimensions: 2, lowerLimit: -1, upperLimit: 1, data: '0 E L U' }
      })
    ).toEqual({ kind: 'eligible' });
  });

  it('accepts finite sample scaling and decimal exponents', () => {
    expect(
      resolveType('sampled-data', {
        valueSampledData: { ...SAMPLED, factor: 0, data: '-0.5 1e-3' }
      })
    ).toEqual({ kind: 'eligible' });
  });

  it.each([
    { data: '0 L', lowerLimit: 0 },
    { data: '0 U', upperLimit: 0 }
  ])('accepts a zero detection limit for the corresponding sample token: %j', (overrides) => {
    expect(resolveType('sampled-data', { valueSampledData: { ...SAMPLED, ...overrides } })).toEqual({
      kind: 'eligible'
    });
  });

  it.each(['', 'E E', 'L U'])('requires usable numeric sample data, not only %j', (data) => {
    expect(
      resolveType('sampled-data', { valueSampledData: { ...SAMPLED, lowerLimit: -1, upperLimit: 1, data } })
    ).toEqual({
      kind: 'ineligible',
      reasons: ['missing-value']
    });
  });
});

describe('payload-free diagnostics', () => {
  it.each([
    { ...REQUEST, key: 'not-registered' },
    { ...REQUEST, subject: '' },
    { ...REQUEST, window: { kind: 'instant' as const, at: '2026-06-20' } }
  ])('rejects invalid requests without echoing request or source data', (request) => {
    expect(() => resolve(observation({ note: [{ text: 'synthetic-private-marker' }] }), request)).toThrow(
      'Reading request requires a registered key, a subject reference and a complete time window'
    );
  });

  it('returns reason codes rather than health values, times, identifiers or notes', () => {
    const value = observation({
      subject: { reference: 'Patient/synthetic-private-marker' },
      valueQuantity: { value: 1234567, system: SYSTEMS.UCUM, code: 's' },
      note: [{ text: 'synthetic-private-marker' }]
    });
    const result = resolve(value);
    expect(result.readings[0]?.eligibility).toEqual({
      kind: 'ineligible',
      reasons: ['unit-mismatch', 'subject-mismatch']
    });
    expect(JSON.stringify({ issues: result.issues, eligibility: result.readings[0]?.eligibility })).not.toMatch(
      /synthetic-private-marker|1234567|2026-/
    );
  });
});
