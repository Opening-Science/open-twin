import { z } from 'zod';

export const PersonalSchema = z.object({
  id: z.string().nonempty(),
  age: z.number().int().min(0).optional().nullable(),
  weight: z.number().min(0).optional().nullable(),
  height: z.number().min(0).optional().nullable(),
  biological_sex: z.string().optional().nullable(),
  email: z.email().optional().nullable()
});

export type OuraPersonal = z.infer<typeof PersonalSchema>;
