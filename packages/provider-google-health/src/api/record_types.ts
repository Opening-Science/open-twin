import type { health_v4 } from 'googleapis';

export const DAILY_TYPES = [
  'daily-heart-rate-variability',
  'daily-heart-rate-zones',
  'daily-oxygen-saturation',
  'daily-respiratory-rate',
  'daily-resting-heart-rate',
  'daily-sleep-temperature-derivations',
  'daily-vo2-max'
] as const;

export type DailyType = (typeof DAILY_TYPES)[number];
export type DailyTypes = DailyType[];

export interface DailyReturnType {
  [key: string]: health_v4.Schema$ListDataPointsResponse;
}

const SAMPLE_TYPES = [
  'blood-glucose',
  'body-fat',
  'core-body-temperature',
  'heart-rate',
  'heart-rate-variability',
  'height',
  'nutrition-log',
  'oxygen-saturation',
  'respiratory-rate-sleep-summary',
  'run-vo2-max',
  'vo2-max',
  'weight'
] as const;

export type SampleType = (typeof SAMPLE_TYPES)[number];
export type SampleTypes = SampleType[];

export interface SampleReturnType {
  [key: string]: health_v4.Schema$ListDataPointsResponse;
}

const INTERVAL_TYPES = [
  ' active-energy-burned',
  'active-minutes',
  'active-zone-minutes',
  'activity-level',
  'altitude',
  'calories-in-heart-rate-zone',
  'distance',
  'floors',
  'sedentary-period',
  'steps',
  'swim-lengths-data',
  'time-in-heart-rate-zone',
  'total-calories'
] as const;

export type IntervalType = (typeof INTERVAL_TYPES)[number];
export type IntervalTypes = IntervalType[];

const SESSION_TYPES = [
  'electrocardiogram',
  'exercise',
  'hydration-log',
  'irregular-rhythm-notification',
  'sleep'
] as const;

export type SessionType = (typeof SESSION_TYPES)[number];
export type SessionTypes = SessionType[];

export type AllTypes = DailyTypes | SampleTypes | IntervalTypes | SessionTypes;
