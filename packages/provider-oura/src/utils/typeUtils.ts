import type { z } from 'zod';
import { CardiovascularAgeListSchema } from '../api/schemas/cardiovascular';
import { OuraDailyActivityResponseListSchema } from '../api/schemas/daily';
import { HeartRateListSchema } from '../api/schemas/heartrate';
import { SleepListSchema } from '../api/schemas/sleep';
import { Spo2ListSchema } from '../api/schemas/spo2';
import { VO2MaxListSchema } from '../api/schemas/vo2max';
import { WorkoutListSchema } from '../api/schemas/workout';

export type SupportedSchemas = {
  daily_activity: typeof OuraDailyActivityResponseListSchema;
  heartrate: typeof HeartRateListSchema;
  sleep: typeof SleepListSchema;
  workout: typeof WorkoutListSchema;
  spo2: typeof Spo2ListSchema;
  daily_cardiovascular_age: typeof CardiovascularAgeListSchema;
  vO2_max: typeof VO2MaxListSchema;
};

export type SupportedSchemaName = keyof SupportedSchemas;

export type SupportedSchemaTypes = {
  [K in SupportedSchemaName]: z.infer<SupportedSchemas[K]>;
};

export type SupportedSchemaEntry = {
  [K in SupportedSchemaName]: { schemaName: K; schema: SupportedSchemas[K] };
}[SupportedSchemaName];

export type GetSchemaType<T extends SupportedSchemaName> = SupportedSchemaTypes[T];

export type GetSchemaName<T extends SupportedSchemaTypes[SupportedSchemaName]> = {
  [K in SupportedSchemaName]: T extends SupportedSchemaTypes[K] ? K : never;
}[SupportedSchemaName];

export function getSchemaNameRuntime(data: SupportedSchemaTypes[SupportedSchemaName]): SupportedSchemaName | 'unknown' {
  // Replace these with actual runtime checks based on your unique schema properties
  if (Array.isArray(data) && data[0]?.bpm !== undefined) return 'heartrate';
  if (Array.isArray(data) && data[0]?.steps !== undefined) return 'daily_activity';
  if (Array.isArray(data) && data[0]?.sleep_score !== undefined) return 'sleep';
  if (Array.isArray(data) && data[0]?.spo2 !== undefined) return 'spo2';
  if (Array.isArray(data) && data[0]?.workout_type !== undefined) return 'workout';
  if (Array.isArray(data) && data[0]?.vascular_age !== undefined) return 'daily_cardiovascular_age';
  if (Array.isArray(data) && data[0]?.vo2max !== undefined) return 'vO2_max';
  return 'unknown';
}

export function getListOfSupportedSchemas(): SupportedSchemaEntry[] {
  return [
    {
      schemaName: 'daily_activity',
      schema: OuraDailyActivityResponseListSchema
    },
    { schemaName: 'heartrate', schema: HeartRateListSchema },
    { schemaName: 'sleep', schema: SleepListSchema },
    { schemaName: 'workout', schema: WorkoutListSchema },
    { schemaName: 'spo2', schema: Spo2ListSchema },
    { schemaName: 'daily_cardiovascular_age', schema: CardiovascularAgeListSchema },
    { schemaName: 'vO2_max', schema: VO2MaxListSchema }
  ];
}
