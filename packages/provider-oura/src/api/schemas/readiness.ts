import { z } from 'zod/v4';
import { ResponseParams } from './client';

export const ReadinessContributorsSchema = z.object({
  activity_balance: z.number().int().min(0).max(100).optional().nullable(),
  hrv_balance: z.number().int().min(0).max(100).optional().nullable(),
  previous_day_activity: z.number().int().min(0).max(100).optional().nullable(),
  previous_night: z.number().int().min(0).max(100).optional().nullable(),
  recovery_index: z.number().int().min(0).max(100).optional().nullable(),
  resting_heart_rate: z.number().int().min(0).max(100).optional().nullable(),
  sleep_balance: z.number().int().min(0).max(100).optional().nullable(),
  sleep_regularity: z.number().int().min(0).max(100).optional().nullable()
});

export const ReadinessItemSchema = z.object({
  id: z.string().nonempty(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Format: YYYY-MM-DD
  timestamp: z.string(), // ISO 8601 datetime string
  score: z.number().int().min(0).max(100).optional().nullable(),
  contributors: ReadinessContributorsSchema,
  temperature_deviation: z.number().optional().nullable(),
  temperature_trend_deviation: z.number().optional().nullable()
});

export const OuraReadinessResponseListSchema = ResponseParams.extend({
  data: z.array(ReadinessItemSchema)
});

export type OuraReadinessResponseList = z.infer<typeof OuraReadinessResponseListSchema>;
export type OuraReadinessItem = z.infer<typeof ReadinessItemSchema>;
