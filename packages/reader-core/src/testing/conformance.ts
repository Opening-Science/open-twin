/**
 * WHAT: describeReaderConformance, the vitest suite every adapter runs over its fixtures: the eight rules of the reader spec.
 * NOT:  Does not replace the HL7 validator or the UCUM and terminology gates, which run over the verification manifest in CI. The delegator half of rule 2 lands with delegate.ts.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: imports vitest, so it lives on the `@open-twin/reader-core/testing` entry and vitest is an optional peer. Import it from a test file only.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { IHealthDataReader } from '../reader';
import type { ReaderDescriptor, ReaderInput } from '../types';
import { checkDescriptor } from '../utils/descriptor';
import { summarise } from './expected';
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
  type FixtureRun,
  runFixture
} from './rules';

export interface ConformanceOptions {
  descriptor: ReaderDescriptor;
  fixtures: ConformanceFixture[];
  /** `open` must reject it with ConnectorError `validation`. */
  invalidInput: ReaderInput;
  validate: FhirBundleValidator;
  secrets?: Record<string, string>;
  now?: string;
}

export const DEFAULT_NOW = '1970-01-01T00:00:00Z';

export function describeReaderConformance(factory: () => IHealthDataReader, options: ConformanceOptions): void {
  const now = options.now ?? DEFAULT_NOW;
  const secrets = options.secrets ?? {};

  describe(`${options.descriptor.id}: reader conformance`, () => {
    it('rule 1: the descriptor equals the registry entry', () => {
      expect(checkDescriptor(factory(), options.descriptor)).toEqual([]);
    });

    it('rule 3: open rejects an invalid input with ConnectorError validation and no fetch', async () => {
      await expectOpenRejectsInvalid(factory, options.invalidInput, secrets);
    });

    for (const fixture of options.fixtures) {
      describe(fixture.name, () => {
        let run: FixtureRun;
        beforeAll(async () => {
          run = await runFixture(factory, fixture, { now });
        });

        it('rule 2: isThisType accepts the fixture without the network', async () => {
          await expectIsThisTypeAccepts(factory(), fixture);
        });
        it('rule 3: open does not fetch', async () => {
          await expectOpenDoesNotFetch(factory, fixture);
        });
        it('rule 4: the bundle validates', () => {
          expectValidBundle(run.result.bundle, options.validate);
        });
        it('rule 5: every Observation is tagged, linked, identified and in UCUM', () => {
          expectObservations(run.result.bundle, options.descriptor, fixture.request);
        });
        it('rule 6: the same request and clock give identical bundles; another window another id', async () => {
          await expectDeterministic(factory, fixture, now);
        });
        it('rule 7: no issue, provenance entry or log line carries a secret', () => {
          expectNoLeak(run, secrets);
        });
        it('rule 8: the summary equals expected.json', () => {
          expect(summarise(run.result.bundle), 'rule 8: the summary differs from expected.json').toEqual(
            fixture.expected
          );
        });
      });
    }
  });
}
