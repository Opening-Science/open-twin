import { z } from 'zod/v4';

export const TokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_at: z.date()
});

export type Token = z.infer<typeof TokenSchema>;
