/**
 * WHAT: Zod (or typed) schema for a vendor/API payload shape.
 * NOT:  Must not map to FHIR or choose LOINC/UCUM; mappers and fhir-core own that.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Schema optional fields are not discriminators for response type (ADR 0005).
 */
import { z } from 'zod/v4';
import { CommonTypeSchema } from './common';
import { MarkerSchema } from './marker';

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
