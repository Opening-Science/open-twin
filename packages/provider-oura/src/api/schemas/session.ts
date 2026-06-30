import { z } from 'zod';
import { ResponseParams } from './client';

const PublicSampleSchema = z.object({
  interval: z.number(),
  items: z.array(z.number()).nullable(),
  timestamp: z.string()
});

export const SessionSchema = z.object({
  id: z.string().min(1),
  day: z.string(),
  end_datetime: z.string(),
  heart_rate: PublicSampleSchema.nullable(),
  heart_rate_variability: PublicSampleSchema.nullable(),
  mood: z.enum(['bad', 'worse', 'same', 'good', 'great']).nullable(),
  motion_count: PublicSampleSchema.nullable(),
  start_datetime: z.string(),
  type: z.enum(['breathing', 'meditation', 'nap', 'relaxation', 'rest', 'body_status'])
});

export const SessionListSchema = ResponseParams.extend({
  data: z.array(SessionSchema)
});

export type Session = z.infer<typeof SessionSchema>;
export type PublicSample = z.infer<typeof PublicSampleSchema>;
export type SessionList = z.infer<typeof SessionListSchema>;
