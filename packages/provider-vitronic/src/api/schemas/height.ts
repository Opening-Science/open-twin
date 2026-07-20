import { z } from 'zod/v4';

import { MarkerSchema } from './marker';

export const HeightSchema = z.object({
  height_path: z.string(),
  at_marker: z.string(),
  height: z.number(),
  label: z.string().nullable(),
  note: z.string().nullable(),
  style: z.string().nullable(),
  key_external: z.string().nullable(),
  hidden: z.boolean().nullable(),
  details: z.object({
    at_marker: MarkerSchema
  })
});

export const HeightListSchema = z.array(HeightSchema);

export type Height = z.infer<typeof HeightSchema>;
export type HeightList = z.infer<typeof HeightListSchema>;
