import { z } from 'zod/v4';
import { MarkerSchema } from './marker';
import { CommonTypeSchema } from './shared';

export const DistanceSchema = CommonTypeSchema.extend({
  distance_path: z.string(),
  from_marker: z.string(),
  to_marker: z.string(),
  distances: z.object({
    linear_distance: z.number(),
    linear_distance_x: z.number(),
    linear_distance_y: z.number(),
    linear_distance_z: z.number()
  }),
  preference: z.string().nullable(),
  details: z.object({
    from_marker: MarkerSchema,
    to_marker: MarkerSchema
  })
});

export const DistanceListSchema = z.array(DistanceSchema);

export type Distance = z.infer<typeof DistanceSchema>;
export type DistanceList = z.infer<typeof DistanceListSchema>;
