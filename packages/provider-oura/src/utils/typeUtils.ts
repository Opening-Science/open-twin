import { z } from "zod";

import { OuraDailyActivityResponseListSchema } from "../api/schemas/daily";

import { HeartRateListSchema } from "../api/schemas/heartrate";

import { SleepListSchema } from "../api/schemas/sleep";

import { WorkoutListSchema } from "../api/schemas/workout";

import { Spo2ListSchema } from "../api/schemas/spo2";

export type SupportedSchemas = {
  daily_activity: typeof OuraDailyActivityResponseListSchema;
  heart_rate: typeof HeartRateListSchema;
  sleep: typeof SleepListSchema;
  workout: typeof WorkoutListSchema;
  spo2: typeof Spo2ListSchema;
};

export type SupportedSchemaName = keyof SupportedSchemas;

export type SupportedSchemaTypes = {
  [K in SupportedSchemaName]: z.infer<SupportedSchemas[K]>;
};

export type SupportedSchemaEntry = {
  [K in SupportedSchemaName]: { schemaName: K; schema: SupportedSchemas[K] };
}[SupportedSchemaName];

export type GetSchemaType<T extends SupportedSchemaName> =
  SupportedSchemaTypes[T];

export function getListOfSupportedSchemas(): SupportedSchemaEntry[] {
  return [
    {
      schemaName: "daily_activity",
      schema: OuraDailyActivityResponseListSchema,
    },
    { schemaName: "heart_rate", schema: HeartRateListSchema },
    { schemaName: "sleep", schema: SleepListSchema },
    { schemaName: "workout", schema: WorkoutListSchema },
    { schemaName: "spo2", schema: Spo2ListSchema },
  ];
}
