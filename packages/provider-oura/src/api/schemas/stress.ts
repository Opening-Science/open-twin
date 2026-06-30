import { z } from 'zod/v4';
import { ResponseParams } from './client';

export const StressSchema = z.object({
  id: z.string().nonempty(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Format: YYYY-MM-DD
  day_summary: z.enum(['restored', 'normal', 'stressful']).optional().nullable(),
  recovery_high: z.number().int().optional().nullable(),
  stress_high: z.number().int().optional().nullable()
});

export const StressListSchema = ResponseParams.extend({
  data: z.array(StressSchema)
});

export type OuraStress = z.infer<typeof StressSchema>;
export type OuraStressList = z.infer<typeof StressListSchema>;
