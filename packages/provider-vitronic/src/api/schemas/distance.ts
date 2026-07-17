import { z } from 'zod/v4';

export const DistanceSchema = z.object({
  distance_path: z.string(),
  from_marker: z.string(),
  to_marker: z.string(),
  distances: z.object({
    linear_distance: z.number(),
    linear_distance_x: z.number(),
    linear_distance_y: z.number(),
    linear_distance_z: z.number()
  }),
  label: z.string().nullable(),
  note: z.string().nullable(),
  style: z.string().nullable(),
  key_external: z.string().nullable(),
  hidden: z.boolean().nullable(),
  preference: z.string().nullable(),
  details: z.object({
    from_marker: z.object({
      marker_type: z.string(),
      marker_path: z.string(),
      position: z.tuple([z.number(), z.number(), z.number()]),
      normal: z.tuple([z.number(), z.number(), z.number()]),
      label: z.string().nullable(),
      note: z.string().nullable(),
      style: z.string().nullable(),
      key_external: z.string().nullable(),
      hidden: z.boolean()
    }),
    to_marker: z.object({
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

export const DistanceListSchema = z.array(DistanceSchema);

export type Distance = z.infer<typeof DistanceSchema>;
export type DistanceList = z.infer<typeof DistanceListSchema>;
