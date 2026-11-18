/**
 * WHAT: Checks the package entry exposes buildOuraBundle for hosts that fetch Oura data themselves.
 * NOT:  Does not test the mapping; the bundle builder tests cover that.
 * GOVERNED BY: DECISIONS.md#d8
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { describe, expect, it } from 'vitest';
import { buildOuraBundle as fromBuilder } from '../fhir/bundleBuilder';
import { buildOuraBundle } from '../index';

describe('provider-oura entry', () => {
  describe('buildOuraBundle', () => {
    it('is the bundle builder itself', () => {
      expect(buildOuraBundle).toBe(fromBuilder);
    });
  });
});
