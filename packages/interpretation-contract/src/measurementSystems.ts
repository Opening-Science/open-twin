/**
 * WHAT: The SystemId each scan and wearable catalogue key lights on the twin, the keys deliberately kept off the body, and systemFor() to look one up.
 * NOT:  Covers no Anchor lab marker (those carry system_id in the Anchor artefact, D12), and scores, converts or ranks nothing.
 * GOVERNED BY: DECISIONS.md#d20; DECISIONS.md#d12; DECISIONS.md#d14; docs/contracts/anchor-organ-to-system.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Every row is pending clinical review. A component key resolves through its parent, so `vitronic:distance.leg.hip.m.linear` lights where `vitronic:distance.leg.hip.m` does.
 */
import type { SystemId, UnrenderableReason } from './generated/interpretation-contract.v0.2.js';

export type MeasurementReview = 'pending';

export interface MeasurementSystem {
  key: string;
  system_id: SystemId;
  review: MeasurementReview;
}

export interface UnrenderableMeasurement {
  key: string;
  reason: UnrenderableReason;
  review: MeasurementReview;
}

const lights = (system_id: SystemId, keys: readonly string[]): MeasurementSystem[] =>
  keys.map((key) => ({ key, system_id, review: 'pending' }));

export const MEASUREMENT_SYSTEMS: readonly MeasurementSystem[] = [
  ...lights('musculoskeletal', [
    'vitronic:property.body.height',
    'vitronic:property.body.mass',
    'vitronic:property.body.bmi',
    'vitronic:property.body.surface',
    'vitronic:property.body.volume',
    'vitronic:distance.torso.shoulder.m',
    'vitronic:distance.leg.hip.m',
    'vitronic:cross-section.torso.cingulum-praefere-posterior.m',
    'vitronic:angle.arm.shoulder.r',
    'vitronic:angle.arm.shoulder.l',
    'vitronic:axis.leg.lateral.malleolus',
    'vitronic:axis.leg.trochanterion',
    'body-height',
    'body-weight',
    'body-fat-percentage',
    'daily-step-count',
    'step-count',
    'session-step-count'
  ]),
  ...lights('cardiovascular', [
    'heart-rate',
    'resting-heart-rate',
    'sleep-mean-heart-rate',
    'sleep-minimum-heart-rate',
    'whoop:recovery.resting-heart-rate',
    'whoop:cycle.average-heart-rate',
    'open-wearables:resting-heart-rate'
  ]),
  ...lights('nervous', [
    'oura:sleep.average-hrv',
    'whoop:recovery.hrv-rmssd',
    'google-health:daily-heart-rate-variability',
    'google-health:heart-rate-variability',
    'open-wearables:hrv-rmssd',
    'open-wearables:hrv-sdnn',
    'total-sleep-time',
    'time-in-bed',
    'rem-sleep-duration',
    'light-sleep-duration',
    'deep-sleep-duration',
    'sleep-latency'
  ]),
  ...lights('respiratory', [
    'oxygen-saturation',
    'oura:spo2.daily-average',
    'whoop:recovery.spo2-percentage',
    'google-health:daily-oxygen-saturation',
    'respiratory-rate',
    'sleep-mean-respiratory-rate',
    'google-health:daily-respiratory-rate'
  ])
];

export const UNRENDERABLE_MEASUREMENTS: readonly UnrenderableMeasurement[] = [
  'oura:sleep-score',
  'oura:readiness-score',
  'whoop:sleep.performance',
  'vo2max',
  'body-temperature',
  'daily-energy-expenditure',
  'session-energy-expenditure'
].map((key) => ({ key, reason: 'not_anatomical', review: 'pending' }));

const BY_KEY = new Map(MEASUREMENT_SYSTEMS.map((row) => [row.key, row]));

export function systemFor(key: string): MeasurementSystem | undefined {
  for (let end = key.length; end > 0; end = key.lastIndexOf('.', end - 1)) {
    const row = BY_KEY.get(key.slice(0, end));
    if (row) return row;
  }
  return undefined;
}
