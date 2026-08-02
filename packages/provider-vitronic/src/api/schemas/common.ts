/**
 * WHAT: Zod (or typed) schema for a vendor/API payload shape.
 * NOT:  Must not map to FHIR or choose LOINC/UCUM; mappers and fhir-core own that.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Schema optional fields are not discriminators for response type (ADR 0005).
 */
import { z } from 'zod/v4';

export const CommonTypeSchema = z.object({
  label: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  style: z.string().nullable().optional(),
  key_external: z.string().nullable().optional(),
  hidden: z.boolean().nullable().optional()
});

export type CommonType = z.infer<typeof CommonTypeSchema>;
