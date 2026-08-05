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

export const AngleSchema = CommonTypeSchema.extend({
  angle_path: z.string(),
  at_marker: z.string(),
  from_marker: z.string(),
  to_marker: z.string(),
  angles: z.object({
    primary: z.number(),
    supplementary: z.number(),
    conjugate: z.number()
  }),
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
