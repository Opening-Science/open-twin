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
