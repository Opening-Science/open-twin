import { z } from 'zod/v4';

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
    at_marker: z.object({
      marker_type: z.string(),
      marker_path: z.string(),
      position: z.tuple([z.number(), z.number(), z.number()]),
      normal: z.tuple([z.number(), z.number(), z.number()]),
      label: z.string().nullable(),
      note: z.string().nullable(),
      style: z.string().nullable(),
      key_external: z.string().nullable(),
      hidden: z.boolean()
    })
  })
});

export const HeightListSchema = z.array(HeightSchema);

export type Height = z.infer<typeof HeightSchema>;
export type HeightList = z.infer<typeof HeightListSchema>;
