import { z } from 'zod/v4';
import { ResponseParams } from './client';

export const RestModeSchema = z.object({
  id: z.string().nonempty(),
  end_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(), // Format: YYYY-MM-DD
  end_time: z.string(),
  start_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(), // Format: YYYY-MM-DD
  start_time: z.string(),
  episodes: z
    .array(
      z.object({
        tag: z.array(z.string()).optional(),
        timestamp: z.string()
      })
    )
    .optional()
});

export const RestModeListSchema = ResponseParams.extend({
  data: z.array(RestModeSchema)
});

export type OuraRestMode = z.infer<typeof RestModeSchema>;
export type OuraRestModeList = z.infer<typeof RestModeListSchema>;
