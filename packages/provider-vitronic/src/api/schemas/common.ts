import { z } from 'zod/v4';

export const CommonTypeSchema = z.object({
  label: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  style: z.string().nullable().optional(),
  key_external: z.string().nullable().optional(),
  hidden: z.boolean().nullable().optional()
});

export type CommonType = z.infer<typeof CommonTypeSchema>;
