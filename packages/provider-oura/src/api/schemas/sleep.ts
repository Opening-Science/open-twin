import { z } from "zod";
import { ResponseParams } from "./client";

// const SleepContributorsSchema = z.object({
//   deep_sleep: z.number().int().nonnegative().optional(),
//   efficiency: z.number().int().nonnegative().optional(),
//   latency: z.number().int().nonnegative().optional(),
//   rem_sleep: z.number().int().nonnegative().optional(),
//   restfulness: z.number().int().nonnegative().optional(),
//   timing: z.number().int().nonnegative().optional(),
//   total_sleep: z.number().int().nonnegative().optional(),
//   recovery_index: z.number().int().nonnegative().optional(),
//   resting_heart_rate: z.number().int().nonnegative().optional(),
//   sleep_balance: z.number().int().nonnegative().optional(),
//   sleep_regularity: z.number().int().nonnegative().optional()
// });

const SleepSchema = z.object({
  id: z.string().nonempty(),
  bedtime_start: z.string(),
  bedtime_end: z.string(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Format: YYYY-MM-DD
  timestamp: z.string().optional(),
  score: z.number().int().min(0).max(100).optional(),

  average_breath: z.number().optional(),
  average_heart_rate: z.number().optional(),
  average_hrv: z.number().optional(),
  awake_time: z.number().int().nonnegative().optional(),
  deep_sleep_duration: z.number().int().nonnegative().optional(),
  efficiency: z.number().int().min(0).max(100).optional(),
  heart_rate: z.record(z.string(), z.unknown()).optional(),
  hrv: z.record(z.string(), z.unknown()).optional(),
  latency: z.number().int().nonnegative().optional(),
  light_sleep_duration: z.number().int().nonnegative().optional(),
  low_battery_alert: z.boolean().optional(),
  lowest_heart_rate: z.number().int().nonnegative().optional(),
  movement_30_sec: z.string().optional(),
  period: z.number().int().optional(),
  readiness: z.record(z.string(), z.unknown()).optional(),

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
  ring_id: z.string().nullable().optional(),
  app_sleep_phase_5_min: z.string().optional(),
  temperature_deviation: z.number().optional(),
  temperature_trend_deviation: z.number().optional(),
});

export const SleepListSchema = ResponseParams.extend({
  data: z.array(SleepSchema),
});

export type OuraSleepList = z.infer<typeof SleepListSchema>;
export type OuraSleep = z.infer<typeof SleepSchema>;
