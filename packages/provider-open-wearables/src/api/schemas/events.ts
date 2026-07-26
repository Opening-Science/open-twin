import { z } from 'zod/v4';
import { paginatedResponse, SourceMetadataSchema, ZoneOffsetSchema } from './common';

/**
 * `SleepStagesSummary` — backend/app/schemas/responses/activity/summaries.py:43-47.
 * All four are minutes, named so in the field itself.
 */
export const SleepStagesSummarySchema = z.object({
  awake_minutes: z.number().nullable().optional(),
  light_minutes: z.number().nullable().optional(),
  deep_minutes: z.number().nullable().optional(),
  rem_minutes: z.number().nullable().optional()
});

/**
 * `SleepStage` — backend/app/schemas/model_crud/activities/sleep.py:8-12, whose
 * `stage` is `SleepStageType` from backend/app/constants/sleep.py:4-11:
 * in_bed | awake | sleeping | light | deep | rem | unknown.
 *
 * Parsed but not mapped: see README, "What this connector does not do".
 */
export const SleepStageIntervalSchema = z.object({
  stage: z.string(),
  start_time: z.string(),
  end_time: z.string()
});

/**
 * `SleepSession` — backend/app/schemas/responses/activity/events.py:61-72:
 *
 *   id: UUID
 *   start_time: datetime
 *   end_time: datetime
 *   zone_offset: str | None = None
 *   source: SourceMetadata
 *   duration_seconds: int
 *   sleep_duration_seconds: int | None = None
 *   efficiency_percent: float | None = None
 *   stages: SleepStagesSummary | None = None
 *   sleep_stage_intervals: list[SleepStage] | None = None
 *   is_nap: bool = False
 */
export const SleepSessionSchema = z.object({
  id: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  zone_offset: ZoneOffsetSchema.nullable().optional(),
  source: SourceMetadataSchema,
  duration_seconds: z.number(),
  sleep_duration_seconds: z.number().nullable().optional(),
  efficiency_percent: z.number().nullable().optional(),
  stages: SleepStagesSummarySchema.nullable().optional(),
  sleep_stage_intervals: z.array(SleepStageIntervalSchema).nullable().optional(),
  is_nap: z.boolean().optional()
});

/**
 * `Workout` — backend/app/schemas/responses/activity/events.py:14-28:
 *
 *   id: UUID
 *   type: str  # Should be WorkoutType enum ideally
 *   name: str | None
 *   start_time: datetime
 *   end_time: datetime
 *   zone_offset: str | None = None
 *   duration_seconds: int | None = None
 *   source: SourceMetadata
 *   calories_kcal: float | None = None
 *   distance_meters: float | None = None
 *   avg_heart_rate_bpm: int | None = None
 *   max_heart_rate_bpm: int | None = None
 *   avg_pace_sec_per_km: int | float | None = None
 *   elevation_gain_meters: float | None = None
 *
 * The `# Should be WorkoutType enum ideally` comment is the platform's own, and is
 * why `type` is parsed as a string: the response model does not constrain it.
 */
export const WorkoutSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().nullable().optional(),
  start_time: z.string(),
  end_time: z.string(),
  zone_offset: ZoneOffsetSchema.nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  source: SourceMetadataSchema,
  calories_kcal: z.number().nullable().optional(),
  distance_meters: z.number().nullable().optional(),
  avg_heart_rate_bpm: z.number().nullable().optional(),
  max_heart_rate_bpm: z.number().nullable().optional(),
  avg_pace_sec_per_km: z.number().nullable().optional(),
  elevation_gain_meters: z.number().nullable().optional()
});

export const SleepSessionPageSchema = paginatedResponse(SleepSessionSchema);
export const WorkoutPageSchema = paginatedResponse(WorkoutSchema);

export type SleepSession = z.infer<typeof SleepSessionSchema>;
export type Workout = z.infer<typeof WorkoutSchema>;
export type SleepSessionPage = z.infer<typeof SleepSessionPageSchema>;
export type WorkoutPage = z.infer<typeof WorkoutPageSchema>;
