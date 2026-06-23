import { z } from "zod";

const SleepContributorsSchema = z.object({
  deep_sleep: z.number().int().nonnegative().optional(),
  efficiency: z.number().int().nonnegative().optional(),
  latency: z.number().int().nonnegative().optional(),
  rem_sleep: z.number().int().nonnegative().optional(),
  restfulness: z.number().int().nonnegative().optional(),
  timing: z.number().int().nonnegative().optional(),
  total_sleep: z.number().int().nonnegative().optional(),
  recovery_index: z.number().int().nonnegative().optional(),
  resting_heart_rate: z.number().int().nonnegative().optional(),
  sleep_balance: z.number().int().nonnegative().optional(),
  sleep_regularity: z.number().int().nonnegative().optional(),
});

const SleepSchema = z.object({
  id: z.string().nonempty(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Format: YYYY-MM-DD
  timestamp: z.string(), // ISO 8601 datetime string
  score: z.number().int().min(0).max(100).optional(),
  contributors: SleepContributorsSchema,

  readiness_score_delta: z.number().optional(),
  rem_sleep_duration: z.number().int().nonnegative().optional(),
  restless_periods: z.number().int().nonnegative().optional(),
  sleep_algorithm_version: z.string().optional(),
  sleep_analysis_reason: z.string().optional(),
  sleep_phase_30_sec: z.string().optional(),
  sleep_phase_5_min: z.string().optional(),
  sleep_score_delta: z.number().optional(),
  time_in_bed: z.number().int().nonnegative().optional(),
  total_sleep_duration: z.number().int().nonnegative().optional(),
  type: z.enum(["long_sleep", "nap", "deleted"]).optional(),
  ring_id: z.string().optional(),
  app_sleep_phase_5_min: z.string().optional(),
  temperature_deviation: z.number().optional(),
  temperature_trend_deviation: z.number().optional(),
});

export const SleepListSchema = z.object({
  data: z.array(SleepSchema),
  next_token: z.string().nullable().optional(),
});

export type OuraSleepList = z.infer<typeof SleepListSchema>;
export type OuraSleep = z.infer<typeof SleepSchema>;
