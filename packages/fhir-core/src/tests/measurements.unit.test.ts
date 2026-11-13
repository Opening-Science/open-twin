import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { MEASUREMENT_DEFINITIONS } from '../measurementDefinitions';
import {
  auditMeasurementDeclarations,
  declareMeasurement,
  definitionProblems,
  isSharedMeasurementKey,
  locateMeasurements,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  measurementKeyOwner,
  sharedMeasurementDefinition,
  validateMeasurementDeclarations
} from '../measurements';
import { createObservation, dataAbsentReason, numericComponent } from '../observation';
import { SYSTEMS } from '../systems';
import { quantity, UCUM } from '../units';

const SUBJECT = { reference: 'urn:uuid:00000000-0000-5000-8000-000000000000' };
const SLEEP_DURATION = { system: SYSTEMS.LOINC, code: '93832-4' };
const TIME_IN_BED = { system: SYSTEMS.LOINC, code: '103213-5' };
const HEART_RATE = { system: SYSTEMS.LOINC, code: '8867-4' };
const SLEEP_PANEL = { system: SYSTEMS.OURA, code: 'sleep-score' };

const SLEEP_SCORE: MeasurementDefinition = {
  key: 'oura:sleep-score',
  description: 'Oura sleep score for one sleep period.',
  valueType: 'quantity',
  canonicalUnit: UCUM.SCORE.code,
  context: { scope: 'sleep-period' }
};

function set(overrides: Partial<MeasurementDeclarationSet> = {}): MeasurementDeclarationSet {
  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    connector: 'oura',
    version: 1,
    coverage: 'complete',
    definitions: [SLEEP_SCORE],
    declarations: [
      declareMeasurement(SLEEP_SCORE, SLEEP_PANEL),
      declareMeasurement('total-sleep-time', SLEEP_DURATION, SLEEP_PANEL),
      declareMeasurement('time-in-bed', TIME_IN_BED, SLEEP_PANEL)
    ],
    ...overrides
  };
}

function sleepPeriod(components: Observation['component'], score: number | undefined = 84): Observation {
  return createObservation({
    id: 'sleep-1',
    code: SLEEP_PANEL,
    subject: SUBJECT,
    effectivePeriod: { start: '2026-06-20T23:12:00+02:00', end: '2026-06-21T07:04:00+02:00' },
    valueQuantity: quantity(score, UCUM.SCORE),
    dataAbsentReason: dataAbsentReason(),
    components
  });
}

describe('shared measurement definitions', () => {
  it('are internally valid, uniquely keyed and unprefixed', () => {
    const keys = MEASUREMENT_DEFINITIONS.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const definition of MEASUREMENT_DEFINITIONS) {
      expect(isSharedMeasurementKey(definition.key)).toBe(true);
      expect(definitionProblems(definition)).toEqual([]);
    }
  });

  it('keep concepts apart that the old aggregate mapping merged', () => {
    // 93832-4 and 103213-5 were both mapped to `total-sleep-time`, and REM/light/deep
    // to one `sleep-staging` measure. They are different quantities.
    for (const key of ['total-sleep-time', 'time-in-bed', 'rem-sleep-duration', 'light-sleep-duration']) {
      expect(sharedMeasurementDefinition(key)).toBeDefined();
    }
    expect(sharedMeasurementDefinition('sleep-minimum-heart-rate')?.context).toEqual({
      scope: 'sleep-period',
      statistic: 'minimum'
    });
    expect(sharedMeasurementDefinition('resting-heart-rate')?.context).toEqual({ scope: 'daily' });
    expect(sharedMeasurementDefinition('daily-step-count')?.context.scope).toBe('daily');
    expect(sharedMeasurementDefinition('step-count')?.context.scope).toBe('interval');
  });
});

describe('measurement keys', () => {
  it('names the owner of a scoped key and none for a shared key', () => {
    expect(measurementKeyOwner('oura:sleep-score')).toBe('oura');
    expect(measurementKeyOwner('oura:readiness.contributor.hrv-balance')).toBe('oura');
    expect(measurementKeyOwner('total-sleep-time')).toBeUndefined();
    expect(measurementKeyOwner('Oura:Score')).toBeUndefined();
  });
});

describe('validateMeasurementDeclarations', () => {
  it('accepts a consistent set', () => {
    expect(validateMeasurementDeclarations(set())).toEqual([]);
  });

  it('reports every problem at once, by code', () => {
    const problems = validateMeasurementDeclarations(
      set({
        schemaVersion: 2 as never,
        version: 0,
        definitions: [
          SLEEP_SCORE,
          { ...SLEEP_SCORE },
          { ...SLEEP_SCORE, key: 'whoop:strain' },
          { ...SLEEP_SCORE, key: 'total-sleep-time' },
          { ...SLEEP_SCORE, key: 'oura:unused' }
        ],
        declarations: [
          declareMeasurement(SLEEP_SCORE, SLEEP_PANEL),
          declareMeasurement(SLEEP_SCORE, SLEEP_PANEL),
          { ...declareMeasurement('total-sleep-time', SLEEP_DURATION), unit: 's' },
          { ...declareMeasurement('time-in-bed', TIME_IN_BED), context: { scope: 'daily' } },
          { ...declareMeasurement('heart-rate', HEART_RATE), valueType: 'string', unit: undefined },
          { ...declareMeasurement('heart-rate', HEART_RATE, SLEEP_PANEL), key: 'nope' },
          { ...declareMeasurement('heart-rate', HEART_RATE, SLEEP_PANEL), key: 'whoop:strain' }
        ]
      })
    );
    expect(problems.map((problem) => problem.code)).toEqual([
      'schema-version',
      'invalid-version',
      'duplicate-definition',
      'foreign-key',
      'shadows-shared-definition',
      'duplicate-declaration',
      'unit-mismatch',
      'context-mismatch',
      'value-type-mismatch',
      'unit-mismatch',
      'unknown-key',
      'foreign-key',
      'unused-definition'
    ]);
  });

  it('treats a commensurable unit as incompatible, not equivalent', () => {
    const problems = validateMeasurementDeclarations(
      set({ declarations: [...set().declarations, { ...declareMeasurement('body-height', HEART_RATE), unit: 'm' }] })
    );
    expect(problems).toEqual([expect.objectContaining({ code: 'unit-mismatch', key: 'body-height' })]);
  });
});

describe('locateMeasurements', () => {
  it('finds components by coding, whatever their order', () => {
    const forward = sleepPeriod([
      numericComponent(SLEEP_DURATION, 422, UCUM.MINUTE),
      numericComponent(TIME_IN_BED, 472, UCUM.MINUTE)
    ]);
    const reversed = sleepPeriod([...(forward.component ?? [])].reverse());
    const keys = (observation: Observation) =>
      Object.fromEntries(
        locateMeasurements(observation, set().declarations).map((found) => [
          found.declaration.key,
          (found.component ?? found.observation).valueQuantity?.value
        ])
      );
    expect(keys(forward)).toEqual({ 'oura:sleep-score': 84, 'total-sleep-time': 422, 'time-in-bed': 472 });
    expect(keys(reversed)).toEqual(keys(forward));
  });

  it('does not match a component under a different parent', () => {
    const other = createObservation({
      code: { system: SYSTEMS.GOOGLE_HEALTH, code: 'sleep' },
      subject: SUBJECT,
      components: [numericComponent(SLEEP_DURATION, 422, UCUM.MINUTE)]
    });
    expect(locateMeasurements(other, set().declarations)).toEqual([]);
  });
});

describe('auditMeasurementDeclarations', () => {
  it('passes when every value is declared with its type and unit', () => {
    const audit = auditMeasurementDeclarations(set(), [
      sleepPeriod([numericComponent(SLEEP_DURATION, 422, UCUM.MINUTE), numericComponent(TIME_IN_BED, 472, UCUM.MINUTE)])
    ]);
    expect(audit.issues).toEqual([]);
    expect(audit.unexercised).toEqual([]);
  });

  it('accepts absence as absence, never as a mismatch', () => {
    const audit = auditMeasurementDeclarations(set(), [
      sleepPeriod([numericComponent(SLEEP_DURATION, undefined, UCUM.MINUTE)], undefined)
    ]);
    expect(audit.issues).toEqual([]);
    expect(audit.unexercised.map((declaration) => declaration.key)).toEqual(['time-in-bed']);
  });

  it('reports an undeclared component without its value', () => {
    const audit = auditMeasurementDeclarations(set(), [
      sleepPeriod([numericComponent({ system: SYSTEMS.OURA, code: 'awake-time' }, 33, UCUM.MINUTE)])
    ]);
    expect(audit.issues).toEqual([
      {
        code: 'undeclared',
        observation: 'sleep-1',
        location: 'component',
        codings: [`${SYSTEMS.OURA}|awake-time`],
        message: 'no declaration matches'
      }
    ]);
    expect(JSON.stringify(audit.issues)).not.toContain('33');
  });

  it('reports a unit the data does not carry — seconds labelled as minutes', () => {
    const seconds = { unit: 'second', code: 's' } as unknown as typeof UCUM.MINUTE;
    const audit = auditMeasurementDeclarations(set(), [
      sleepPeriod([numericComponent(SLEEP_DURATION, 25320, seconds)])
    ]);
    expect(audit.issues.map((issue) => [issue.code, issue.message])).toEqual([
      ['unit-mismatch', 'total-sleep-time declares min but emits s']
    ]);
  });

  it('reports a value of the wrong type', () => {
    const observation = createObservation({ id: 'sleep-1', code: SLEEP_PANEL, subject: SUBJECT, valueString: '84' });
    const audit = auditMeasurementDeclarations(set(), [observation]);
    expect(audit.issues.map((issue) => issue.code)).toEqual(['value-type-mismatch']);
  });

  it('reports an element two declarations could both claim', () => {
    const both = createObservation({
      id: 'hr',
      code: [HEART_RATE, { system: SYSTEMS.OURA, code: 'session-mean-heart-rate' }],
      subject: SUBJECT,
      valueQuantity: quantity(60, UCUM.PER_MINUTE)
    });
    const ambiguous = set({
      definitions: [],
      declarations: [
        declareMeasurement('heart-rate', HEART_RATE),
        declareMeasurement('sleep-mean-heart-rate', { system: SYSTEMS.OURA, code: 'session-mean-heart-rate' })
      ]
    });
    expect(auditMeasurementDeclarations(ambiguous, [both]).issues.map((issue) => issue.code)).toEqual(['ambiguous']);
  });

  it('requires a value-less declaration to stay value-less', () => {
    const panel: MeasurementDefinition = { ...SLEEP_SCORE, valueType: 'none', canonicalUnit: undefined };
    const declaration = declareMeasurement(panel, SLEEP_PANEL);
    const audit = auditMeasurementDeclarations({ coverage: 'complete', declarations: [declaration] }, [
      sleepPeriod(undefined)
    ]);
    expect(audit.issues.map((issue) => issue.code)).toEqual(['value-type-mismatch']);
  });

  it('does not report forwarded codes for an open set', () => {
    const foreign = createObservation({
      code: { system: SYSTEMS.LOINC, code: '2339-0' },
      subject: SUBJECT,
      valueQuantity: quantity(90, UCUM.MG_PER_DL)
    });
    const open = set({ coverage: 'open', definitions: [], declarations: [] });
    expect(auditMeasurementDeclarations(open, [foreign]).issues).toEqual([]);
    expect(auditMeasurementDeclarations({ ...open, coverage: 'complete' }, [foreign]).issues).toHaveLength(1);
  });

  it('reads a bundle as well as a resource list, and ignores non-Observations', () => {
    const bundle = {
      resourceType: 'Bundle' as const,
      type: 'collection' as const,
      entry: [{ resource: { resourceType: 'Patient' as const } }, { resource: sleepPeriod([]) }]
    };
    const audit = auditMeasurementDeclarations(set(), bundle);
    expect(audit.issues).toEqual([]);
    expect(audit.matches.size).toBe(1);
  });
});
