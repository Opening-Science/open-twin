import { z } from "zod";

const ActivityMetSchema = z.object({
  interval: z.number().nonnegative().optional(),
  items: z.array(z.number().nonnegative()),
  timestamp: z.string(), // ISO 8601 datetime string indicating starting time
});

const ActivityContributorsSchema = z.object({
  meet_daily_targets: z.number().int().min(0).max(100).optional(),
  move_every_hour: z.number().int().min(0).max(100).optional(),
  recovery_time: z.number().int().min(0).max(100).optional(),
  stay_active: z.number().int().min(0).max(100).optional(),
  training_frequency: z.number().int().min(0).max(100).optional(),
  training_volume: z.number().int().min(0).max(100).optional(),
});

const DailyActivityItemSchema = z.object({
  id: z.string().nonempty(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Format: YYYY-MM-DD
  timestamp: z.string(), // ISO 8601 datetime string
  score: z.number().int().min(0).max(100).optional(),
  active_calories: z.number().int().nonnegative().optional(),
  average_met_minutes: z.number().optional(),
  class_5_min: z.string().optional(),
  contributors: ActivityContributorsSchema,
  equivalent_walking_distance: z.number().int().nonnegative().optional(),
  high_activity_met_minutes: z.number().int().nonnegative().optional(),
  high_activity_time: z.number().int().nonnegative().optional(),
  inactivity_alerts: z.number().int().nonnegative().optional(),
  low_activity_met_minutes: z.number().int().nonnegative().optional(),
  low_activity_time: z.number().int().nonnegative().optional(),
  medium_activity_met_minutes: z.number().int().nonnegative().optional(),
  medium_activity_time: z.number().int().nonnegative().optional(),
  met: ActivityMetSchema.optional(),
  meters_to_target: z.number().int().nonnegative().optional(),
  non_wear_time: z.number().int().nonnegative().optional(),
  resting_time: z.number().int().nonnegative().optional(),
  sedentary_met_minutes: z.number().int().nonnegative().optional(),
  sedentary_time: z.number().int().nonnegative().optional(),
  steps: z.number().int().nonnegative().optional(),
  target_calories: z.number().int().nonnegative().optional(),
  target_meters: z.number().int().nonnegative().optional(),
  total_calories: z.number().int().nonnegative().optional(),
});

export const OuraMultipleDailyActivityResponseSchema = z.object({
  data: z.array(DailyActivityItemSchema),
  next_token: z.string().nullable().optional(),
});

export type OuraMultipleDailyActivityResponse = z.infer<
  typeof OuraMultipleDailyActivityResponseSchema
>;
export type OuraDailyActivityItem = z.infer<typeof DailyActivityItemSchema>;
