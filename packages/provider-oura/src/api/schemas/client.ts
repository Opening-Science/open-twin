import { z } from 'zod';

export const RequestParamsSchema = z.object({
  type: z.enum(['daily_activity', 'activity', 'sleep', 'readiness', 'heartrate', 'daily_spo2', 'personal_info']),
  start_date: z
    .string()
    .regex(/^\d{2}.\d{2}.\d{4}$/)
    .optional(), // Format: DD.MM.YYYY
  end_date: z
    .string()
    .regex(/^\d{2}.\d{2}.\d{4}$/)
    .optional(), // Format: DD.MM.YYYY
  next_token: z.string().nullable().optional(),
  fields: z.array(z.string()).optional(),
  latest: z.boolean().nullable().optional()
});

export const ResponseParams = z.object({
  data: z.any(),
  next_token: z.string().nullable().optional()
});

export type RequestParams = z.infer<typeof RequestParamsSchema>;
export type OuraRequestParams = Omit<z.infer<typeof RequestParamsSchema>, 'type' | 'latest'>;
export type OuraRequestParamsHeartRate = Omit<z.infer<typeof RequestParamsSchema>, 'type'>;

export type OuraResponseParams = z.infer<typeof ResponseParams>;
