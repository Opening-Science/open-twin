import { z } from 'zod/v4';
import { MarkerSchema } from './marker';

export const AngleSchema = z.object({
  angle_path: z.string(),
  at_marker: z.string(),
  from_marker: z.string(),
  to_marker: z.string(),
  angles: z.object({
    primary: z.number(),
    supplementary: z.number(),
    conjugate: z.number()
  }),
  label: z.string().nullable(),
  note: z.string().nullable(),
  style: z.string().nullable(),
  key_external: z.string().nullable(),
  hidden: z.boolean(),
  preference: z.string().nullable(),
  details: z.object({
    at_marker: MarkerSchema,
    from_marker: MarkerSchema,
    to_marker: MarkerSchema
  })
});

export const AngleListSchema = z.array(AngleSchema);

export type Angle = z.infer<typeof AngleSchema>;
export type AngleList = z.infer<typeof AngleListSchema>;
