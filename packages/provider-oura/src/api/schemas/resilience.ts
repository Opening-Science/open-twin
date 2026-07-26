import { z } from 'zod';
import { ResponseParams } from './client';

export const ResilienceContributorsSchema = z.object({
  sleep_recovery: z.number().int().min(0).max(100).optional(),
  daytime_recovery: z.number().int().min(0).max(100).optional(),
  stress: z.number().int().min(0).max(100).optional()
});

export const ResilienceItemSchema = z.object({
  id: z.string().nonempty(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Format: YYYY-MM-DD
  level: z.enum(['limited', 'adequate', 'solid', 'strong', 'exceptional']).optional(),
  contributors: ResilienceContributorsSchema
});

export const OuraResilienceResponseListSchema = ResponseParams.extend({
  data: z.array(ResilienceItemSchema)
});

export type OuraResilienceResponseList = z.infer<typeof OuraResilienceResponseListSchema>;
export type OuraResilienceItem = z.infer<typeof ResilienceItemSchema>;
