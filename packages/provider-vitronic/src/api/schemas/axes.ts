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

export const AxesListSchema = z.array(AxisSchema);

export type Axis = z.infer<typeof AxisSchema>;
export type AxesList = z.infer<typeof AxesListSchema>;
