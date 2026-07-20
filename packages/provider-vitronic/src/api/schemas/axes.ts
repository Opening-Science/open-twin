import { z } from 'zod/v4';
import { MarkerSchema } from './marker';
import { CommonTypeSchema } from './shared';

export const AxisSchema = CommonTypeSchema.extend({
  axis_path: z.string(),
  markers: z.array(z.string()),
  rotation: z.object({
    xy: z.number(),
    yz: z.number(),
    xz: z.number()
  }),
  details: z.object({
    markers: z.array(MarkerSchema)
  })
});
