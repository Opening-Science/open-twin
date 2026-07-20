import { z } from 'zod/v4';

export const CommonTypeSchema = z.object({
  label: z.string().nullable(),
  note: z.string().nullable(),
  style: z.string().nullable(),
  key_external: z.string().nullable(),
  hidden: z.boolean().nullable()
});

export type CommonType = z.infer<typeof CommonTypeSchema>;
