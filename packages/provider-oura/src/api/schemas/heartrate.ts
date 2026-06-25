import { z } from "zod";
import { ResponseParams } from "./client";

export const HeartRateSchema = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  producer_timestamp: z.number(), // Format: UNIX timestamp
  bpm: z.number(),
  source: z.enum(["awake", "workout", "rest", "sleep", "live", "session"]),
});

export const HeartRateListSchema = ResponseParams.extend({
  data: z.array(HeartRateSchema),
});

export type OuraHeartRate = z.infer<typeof HeartRateSchema>;
export type OuraHeartRateList = z.infer<typeof HeartRateListSchema>;
