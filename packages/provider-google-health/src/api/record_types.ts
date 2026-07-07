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

export const SAMPLE_TYPES = [
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

export const INTERVAL_TYPES = [
  'active-energy-burned',
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

export const SESSION_TYPES = [
  'electrocardiogram',
  'exercise',
  'hydration-log',
  'irregular-rhythm-notification',
  'sleep'
] as const;

export type SessionType = (typeof SESSION_TYPES)[number];
export type SessionTypes = SessionType[];

export type AllType = DailyType | SampleType | IntervalType | SessionType;
export type AllTypes = DailyTypes | SampleTypes | IntervalTypes | SessionTypes;

export function getFilterTypeCategory(type: AllType): 'daily' | 'sample_time' | 'interval' | 'session' {
  if ((DAILY_TYPES as readonly string[]).includes(type)) return 'daily';
  if ((SAMPLE_TYPES as readonly string[]).includes(type)) return 'sample_time';
  if ((INTERVAL_TYPES as readonly string[]).includes(type)) return 'interval';
  if ((SESSION_TYPES as readonly string[]).includes(type)) return 'session';

  throw new Error(`Unknown type: ${type}`);
}

const DEFAULT_START = '1970-01-01T00:00:00Z';

export function buildTypeFilter(type: AllType, startDate?: string, endDate?: string): string {
  const start = startDate ?? DEFAULT_START;
  const end = endDate ?? new Date().toISOString();
  const category = getFilterTypeCategory(type);

  const filterPrefix = type.replace(/-/g, '_');

  switch (category) {
    case 'daily': {
      const field = `${filterPrefix}.date`;
      return `${field} >= "${toCivilDate(start)}" AND ${field} < "${toCivilDate(end)}"`;
    }
    case 'sample_time': {
      const field = `${filterPrefix}.sample_time.physical_time`;
      return `${field} >= "${start}" AND ${field} < "${end}"`;
    }
    case 'interval': {
      const field = `${filterPrefix}.interval.start_time`;
      return `${field} >= "${start}" AND ${field} < "${end}"`;
    }
    case 'session': {
      const field = `${filterPrefix}.interval.civil_start_time`;
      return `${field} >= "${toCivilDate(start)}" AND ${field} < "${toCivilDate(end)}"`;
    }
  }
}

function toCivilDate(value: string): string {
  return value.slice(0, 10);
}
