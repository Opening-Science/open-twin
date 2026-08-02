/**
 * WHAT: Zod (or typed) schema for a vendor/API payload shape.
 * NOT:  Must not map to FHIR or choose LOINC/UCUM; mappers and fhir-core own that.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Schema optional fields are not discriminators for response type (ADR 0005).
 */
import { z } from 'zod/v4';

import { CommonTypeSchema } from './common';

export const PropertySchema = CommonTypeSchema.extend({
  property_path: z.string(),
  value: z.unknown()
});

export const PropertyListSchema = z.array(PropertySchema);

export type Property = z.infer<typeof PropertySchema>;
export type PropertyList = z.infer<typeof PropertyListSchema>;
