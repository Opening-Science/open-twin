import { z } from 'zod/v4';
import { ResponseParams } from './client';

export const CardiovascularAgeSchema = z.object({
  id: z.string().nonempty(),
  pulse_wave_velocity: z.number().nullable(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Format: YYYY-MM-DD
  vascular_age: z.number().nullable()
});

export const CardiovascularAgeListSchema = ResponseParams.extend({
  data: z.array(CardiovascularAgeSchema)
});

export type OuraCardiovascularAge = z.infer<typeof CardiovascularAgeSchema>;
export type OuraCardiovascularAgeList = z.infer<typeof CardiovascularAgeListSchema>;
