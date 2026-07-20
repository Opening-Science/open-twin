import { z } from 'zod/v4';
import { CommonTypeSchema } from './shared';

export const MarkerSchema = CommonTypeSchema.extend({
  marker_type: z.string(),
  marker_path: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  normal: z.tuple([z.number(), z.number(), z.number()]),
  refering_measures: z
    .object({
      heights: z.array(z.string()),
      distances: z.array(z.string()),
      crosssections: z.array(z.string()),
      angles: z.array(z.string()),
      axes: z.array(z.string())
    })
    .optional()
    .nullable(),
  overriding: z.any().nullable().optional()
});

export const MarkerListSchema = z.array(MarkerSchema);

export type Marker = z.infer<typeof MarkerSchema>;
export type MarkerList = z.infer<typeof MarkerListSchema>;
