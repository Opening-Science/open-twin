import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NOW, describeReaderConformance } from '../testing/conformance';
import { type ExpectedSummary, summarise } from '../testing/expected';
import {
  type ConformanceFixture,
  expectDeterministic,
  expectIsThisTypeAccepts,
  expectNoLeak,
  expectObservations,
  expectOpenDoesNotFetch,
  expectOpenRejectsInvalid,
  expectValidBundle,
  type FhirBundleValidator,
  runFixture
} from '../testing/rules';
import type { ReaderInput } from '../types';
import { checkDescriptor } from '../utils/descriptor';
import { type Defect, FAKE_STEPS_DESCRIPTOR, FakeStepsReader } from './fake-reader';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const expected = JSON.parse(readFileSync(join(FIXTURES, 'expected.json'), 'utf8')) as ExpectedSummary;

const fixture: ConformanceFixture = {
  name: 'wearer-1, three days, one missing',
  input: { kind: 'file', path: join(FIXTURES, 'synthetic.steps.json') },
  request: {
    subjectKey: 'wearer-1',
    window: { start: '2026-03-01T00:00:00+01:00', end: '2026-03-03T23:59:59+01:00' }
  },
  expected
};

const invalidInput: ReaderInput = { kind: 'file', text: '{"format":"something-else","user":"x"}' };
const secrets = { 'wearer id': 'wearer-1' };

/**
 * Stands in for validateFhir, which lives in fhir-r4 and cannot be a dependency here
 * (the fhir-r4 adapter will depend on this package). It proves the plumbing: rule 4
 * fails when the injected validator reports an error.
 */
const structural: FhirBundleValidator = (bundle) => {
  const issues: Array<{ severity: string; message: string; expression?: string }> = [];
  for (const [index, entry] of (bundle.entry ?? []).entries()) {
    if (!entry.fullUrl)
      issues.push({ severity: 'error', message: 'entry has no fullUrl', expression: `Bundle.entry[${index}]` });
    const resource = entry.resource;
    if (resource?.resourceType === 'Observation' && !(resource as Observation).status) {
      issues.push({
        severity: 'error',
        message: 'Observation has no status',
        expression: `Bundle.entry[${index}].resource`
      });
    }
  }
  return { ok: issues.length === 0, issues };
};

const make = (defect?: Defect) => () => new FakeStepsReader(defect);

describe('the correct fake reader, beyond the shared suite', () => {
  it('reports the missing day as one issue, counts four records, and stamps the host clock', async () => {
    const run = await runFixture(make(), fixture, { now: DEFAULT_NOW });
    expect(run.result.issues).toHaveLength(1);
    expect(run.result.provenance.recordCount).toBe(4);
    expect(run.result.bundle.timestamp).toBe(DEFAULT_NOW);
  });
});

describe('each deliberately broken reader fails the rule that covers its defect', () => {
  it('rule 1: a version that differs from the registry entry', () => {
    expect(checkDescriptor(make('wrong-version')(), FAKE_STEPS_DESCRIPTOR)).toEqual([
      'rule 1: descriptor.version differs from the registry entry'
    ]);
  });

  it('rule 2: isThisType that touches the network', async () => {
    await expect(expectIsThisTypeAccepts(make('network-in-is-this-type')(), fixture)).rejects.toThrow(
      'rule 2: isThisType called fetch'
    );
  });

  it('rule 3: open that accepts any input', async () => {
    await expect(expectOpenRejectsInvalid(make('accepts-any-input'), invalidInput, secrets)).rejects.toThrow(
      'rule 3: open accepted an invalid input'
    );
  });

  it('rule 3: open that fetches', async () => {
    await expect(expectOpenDoesNotFetch(make('fetches-in-open'), fixture)).rejects.toThrow('rule 3: open called fetch');
  });

  it('rule 4: a bundle the validator rejects', async () => {
    const run = await runFixture(make('no-status'), fixture, { now: DEFAULT_NOW });

    expect(() => expectValidBundle(run.result.bundle, structural)).toThrow('rule 4: the validator reported errors');
  });

  it.each<[Defect, string]>([
    ['drops-meta-tag', 'rule 5: Bundle.entry[1] has no connector meta tag'],
    ['wrong-subject', 'rule 5: Bundle.entry[1] subject is not a urn:uuid reference (D1)'],
    ['non-uuid-id', 'rule 5: Bundle.entry[1] id is not a UUID (D2)'],
    ['no-ucum', 'rule 5: Bundle.entry[1].valueQuantity.system is not UCUM']
  ])('rule 5: %s', async (defect, violation) => {
    const run = await runFixture(make(defect), fixture, { now: DEFAULT_NOW });

    expect(() => expectObservations(run.result.bundle, FAKE_STEPS_DESCRIPTOR, fixture.request)).toThrow(violation);
  });

  it('rule 5: a panel with components and no root value is accepted (FHIR allows it)', async () => {
    const run = await runFixture(make(), fixture, { now: DEFAULT_NOW });
    const bundle = run.result.bundle;
    const entry = bundle.entry?.find((e) => e.resource?.resourceType === 'Observation');
    const observation = entry?.resource as Observation;
    const { valueQuantity: _value, ...panel } = observation;
    panel.component = [{ code: observation.code, valueQuantity: observation.valueQuantity }];
    if (entry) entry.resource = panel as Observation;

    expect(() => expectObservations(bundle, FAKE_STEPS_DESCRIPTOR, fixture.request)).not.toThrow();
  });

  it('rule 5: a caller-supplied subject that the reader ignores', async () => {
    const request = { ...fixture.request, subject: { reference: 'Patient/caller-supplied' } };
    const run = await runFixture(make('wrong-subject'), fixture, { now: DEFAULT_NOW, request });

    expect(() => expectObservations(run.result.bundle, FAKE_STEPS_DESCRIPTOR, request)).toThrow(
      "rule 5: Bundle.entry[0] subject is not the caller's (D1)"
    );
  });

  it('rule 6: a bundle id that changes between runs', async () => {
    await expect(expectDeterministic(make('random-id'), fixture, DEFAULT_NOW)).rejects.toThrow(
      'rule 6: two reads with the same request and clock gave different bundles'
    );
  });

  it('rule 6: a bundle id that ignores the window', async () => {
    await expect(expectDeterministic(make('window-ignored'), fixture, DEFAULT_NOW)).rejects.toThrow(
      'rule 6: two requests with different windows share one Bundle.id'
    );
  });

  it('rule 7: an issue that carries the wearer id', async () => {
    const run = await runFixture(make('leaks-payload'), fixture, { now: DEFAULT_NOW });

    expect(() => expectNoLeak(run, secrets)).toThrow('rule 7: an issue leaks');
  });

  it('rule 7: a log line that carries the wearer id', async () => {
    const run = await runFixture(make('leaks-payload'), fixture, { now: DEFAULT_NOW });

    expect(() => expectNoLeak({ ...run, result: { ...run.result, issues: [] } }, secrets)).toThrow(
      'rule 7: a log line leaks'
    );
  });

  it('rule 7: an e-mail address in an issue is caught without a secrets list', () => {
    const run = {
      result: {
        bundle: { resourceType: 'Bundle' as const, type: 'collection' as const },
        issues: [{ severity: 'warning' as const, code: 'x', details: 'contact wearer@example.org' }],
        provenance: { reader: { id: 'x', version: '0' }, retrievedAt: DEFAULT_NOW, source: { id: 'x' }, recordCount: 0 }
      },
      logs: []
    };

    expect(() => expectNoLeak(run)).toThrow('rule 7: an issue leaks');
  });

  it('rule 8: an extra Observation changes the counts', async () => {
    const run = await runFixture(make('extra-observation'), fixture, { now: DEFAULT_NOW });

    expect(summarise(run.result.bundle)).toMatchObject({
      resourceTypes: { Observation: 4 },
      observationCodes: { 'urn:open-twin:test:fake-steps|daily-steps': 4 }
    });
    expect(summarise(run.result.bundle)).not.toEqual(expected);
  });

  it('rule 8: 0 written for a missing value is caught through absentValues, not through rule 5', async () => {
    const run = await runFixture(make('zero-for-missing'), fixture, { now: DEFAULT_NOW });

    expect(() => expectObservations(run.result.bundle, FAKE_STEPS_DESCRIPTOR, fixture.request)).not.toThrow();
    expect(summarise(run.result.bundle)).toEqual({ ...expected, absentValues: 0 });
  });
});

describeReaderConformance(make(), {
  descriptor: FAKE_STEPS_DESCRIPTOR,
  fixtures: [fixture],
  invalidInput,
  validate: structural,
  secrets
});
