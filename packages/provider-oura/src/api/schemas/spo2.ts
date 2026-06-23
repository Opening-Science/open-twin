import { z } from "zod";

export const spo2Schema = z.object({
  id: z.string().nonempty(),
  breathing_disturbance_index: z.number().min(0).max(100).nullable(),
  spo2_percentage: z.object({ average: z.number().min(0).max(100) }).nullable(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Format: YYYY-MM-DD
});

const spo2ListSchema = z.object({
  data: z.array(spo2Schema),
  next_token: z.string().nullable(),
});

export type OuraSpo2 = z.infer<typeof spo2Schema>;
export type OuraSpo2List = z.infer<typeof spo2ListSchema>;
