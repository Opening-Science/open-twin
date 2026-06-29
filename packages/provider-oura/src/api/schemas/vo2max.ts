import { z } from 'zod/v4';
import { ResponseParams } from './client';

export const VO2MaxSchema = z.object({
  id: z.string().nonempty(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Format: YYYY-MM-DD
  timestamp: z.string(), // ISO 8601 datetime string
  vo2_max: z.number().optional()
});

export const VO2MaxListSchema = ResponseParams.extend({
  data: z.array(VO2MaxSchema)
});

export type OuraVO2MaxResponseList = z.infer<typeof VO2MaxListSchema>;
export type OuraVO2MaxItem = z.infer<typeof VO2MaxSchema>;
