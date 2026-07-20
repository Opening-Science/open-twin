import { z } from 'zod/v4';

export const TokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_at: z.date()
});

export type Token = z.infer<typeof TokenSchema>;

export const CommonTypeSchema = z.object({
  label: z.string().nullable(),
  note: z.string().nullable(),
  style: z.string().nullable(),
  key_external: z.string().nullable(),
  hidden: z.boolean().nullable()
});

export type CommonType = z.infer<typeof CommonTypeSchema>;
