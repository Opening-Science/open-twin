import { z } from "zod";
import { ResponseParams } from "./client";

export const spo2Schema = z.object({
  id: z.string().nonempty(),
  breathing_disturbance_index: z.number().min(0).max(100).nullable(),
  spo2_percentage: z.object({ average: z.number().min(0).max(100) }).nullable(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Format: YYYY-MM-DD
});

const spo2ListSchema = ResponseParams.extend({
  data: z.array(spo2Schema),
});

export type OuraSpo2 = z.infer<typeof spo2Schema>;
export type OuraSpo2List = z.infer<typeof spo2ListSchema>;
