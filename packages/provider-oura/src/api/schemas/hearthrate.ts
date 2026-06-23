import { z } from "zod";

export const HeartRateSchema = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  timestamp_unix: z.number(), // Format: UNIX timestamp
  bpm: z.number(),
  source: z.literal(["awake", "workout", "rest", "sleep", "live", "session"]),
});

const HeartRateListSchema = z.object({
  data: z.array(HeartRateSchema),
  next_token: z.string().nullable(),
});

export type OuraHeartRate = z.infer<typeof HeartRateSchema>;
export type OuraHeartRateList = z.infer<typeof HeartRateListSchema>;
