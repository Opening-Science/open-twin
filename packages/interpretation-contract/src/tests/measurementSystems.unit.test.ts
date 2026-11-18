/**
 * WHAT: Checks the measurement → SystemId table against the keys the connectors really declare, and that the kiosk set all lands on the body.
 * NOT:  Does not judge whether a system is clinically right; every row stays pending review.
 * GOVERNED BY: DECISIONS.md#d20
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { OPEN_WEARABLES_MEASUREMENTS } from '@open-twin/open-wearables';
import { GOOGLE_HEALTH_MEASUREMENTS } from '@open-twin/provider-google-health';
import { OURA_MEASUREMENTS } from '@open-twin/provider-oura';
import { VITRONIC_MEASUREMENTS } from '@open-twin/provider-vitronic';
import { WHOOP_MEASUREMENTS } from '@open-twin/provider-whoop';
import { describe, expect, it } from 'vitest';
import { SYSTEM_IDS } from '../index.js';
import { MEASUREMENT_SYSTEMS, systemFor, UNRENDERABLE_MEASUREMENTS } from '../measurementSystems.js';

const DECLARED = new Set(
  [
    OURA_MEASUREMENTS,
    WHOOP_MEASUREMENTS,
    GOOGLE_HEALTH_MEASUREMENTS,
    VITRONIC_MEASUREMENTS,
    OPEN_WEARABLES_MEASUREMENTS
  ].flatMap((set) => set.declarations.map((declaration) => declaration.key))
);

const KIOSK = {
  scan: [
    'vitronic:property.body.height',
    'vitronic:property.body.mass',
    'vitronic:property.body.bmi',
    'vitronic:property.body.surface',
    'vitronic:property.body.volume',
    'vitronic:distance.torso.shoulder.m',
    'vitronic:distance.leg.hip.m',
    'vitronic:cross-section.torso.cingulum-praefere-posterior.m.perimeter-circumference',
    'vitronic:angle.arm.shoulder.r',
    'vitronic:angle.arm.shoulder.l',
    'vitronic:axis.leg.lateral.malleolus',
    'vitronic:axis.leg.trochanterion'
  ],
  wearables: [
    'resting-heart-rate',
    'whoop:recovery.resting-heart-rate',
    'whoop:recovery.hrv-rmssd',
    'oura:sleep.average-hrv',
    'oxygen-saturation',
    'daily-step-count',
    'total-sleep-time'
  ]
};

const keys = (rows: readonly { key: string }[]) => rows.map((row) => row.key);

describe('measurement systems', () => {
  describe('MEASUREMENT_SYSTEMS', () => {
    it('only names keys a connector declares', () => {
      expect(keys(MEASUREMENT_SYSTEMS).filter((key) => !DECLARED.has(key))).toEqual([]);
    });

    it('only uses the nine SystemId values', () => {
      expect(MEASUREMENT_SYSTEMS.filter((row) => !SYSTEM_IDS.includes(row.system_id))).toEqual([]);
    });

    it('names each key once', () => {
      expect(new Set(keys(MEASUREMENT_SYSTEMS)).size).toBe(MEASUREMENT_SYSTEMS.length);
    });
  });

  describe('UNRENDERABLE_MEASUREMENTS', () => {
    it('only names keys a connector declares', () => {
      expect(keys(UNRENDERABLE_MEASUREMENTS).filter((key) => !DECLARED.has(key))).toEqual([]);
    });

    it('is kept apart from the keys that light the body', () => {
      expect(keys(UNRENDERABLE_MEASUREMENTS).filter((key) => systemFor(key))).toEqual([]);
    });
  });

  describe('the kiosk set', () => {
    it.each([...KIOSK.scan, ...KIOSK.wearables])('%s lands on the body', (key) => {
      expect(DECLARED.has(key)).toBe(true);
      expect(systemFor(key)).toBeDefined();
    });
  });

  describe('systemFor', () => {
    it('resolves a component through its parent', () => {
      expect(systemFor('vitronic:distance.leg.hip.m.linear')?.system_id).toBe('musculoskeletal');
    });

    it('returns undefined for a key with no system', () => {
      expect(systemFor('vo2max')).toBeUndefined();
    });
  });
});
