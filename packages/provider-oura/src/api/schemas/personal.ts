import { z } from "zod";

export const PersonalSchema = z.object({
  id: z.string().nonempty(),
  age: z.number().int().min(0).nullable(),
  weight: z.number().min(0).nullable(),
  height: z.number().min(0).nullable(),
  biological_sex: z.string().nullable(),
  email: z.email().nullable(),
});

export type OuraPersonal = z.infer<typeof PersonalSchema>;
