import { z } from 'zod/v4';
import { CommonTypeSchema } from './common';
import { MarkerSchema } from './marker';

export const HeightSchema = CommonTypeSchema.extend({
  height_path: z.string(),
  at_marker: z.string(),
  height: z.number(),
  details: z.object({
    at_marker: MarkerSchema
  })
});

export const HeightListSchema = z.array(HeightSchema);

export type Height = z.infer<typeof HeightSchema>;
export type HeightList = z.infer<typeof HeightListSchema>;
