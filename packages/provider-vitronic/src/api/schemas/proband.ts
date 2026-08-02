/**
 * WHAT: Zod (or typed) schema for a vendor/API payload shape.
 * NOT:  Must not map to FHIR or choose LOINC/UCUM; mappers and fhir-core own that.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Schema optional fields are not discriminators for response type (ADR 0005).
 */
import { z } from 'zod/v4';
import { ViatarListSchema } from './viatars';

export const ProbandRequestSchema = z.object({
  address: z.object({
    city: z.string(),
    country: z.string(),
    street: z.string(),
    zip_code: z.string()
  }),
  contact: z.object({
    email: z.string(),
    phone: z.string()
  }),
  date_of_birth: z.string(),
  gender: z.enum(['male', 'female', 'other']),
  key_external: z.string(),
  name_family: z.string(),
  name_given: z.string(),
  note: z.string().nullable()
});

export const UploadCredentialsSchema = z
  .object({
    method: z.enum(['PUT', 'POST']).nullable().optional(),
    url: z.string().nullable().optional(),
    auth: z.tuple([z.string(), z.string()]).nullable().optional(),
    headers: z.record(z.string(), z.unknown()).nullable().optional()
  })
  .nullable();

export const MetaSchema = z
  .object({
    crtime: z.iso.datetime({ local: true }).nullable().optional(),
    mtime: z.iso.datetime({ local: true }).nullable().optional(),
    info: z.string().nullable().optional()
  })
  .nullable();

export const ProbandResponseSchema = ProbandRequestSchema.extend({
  proband_id: z.number().int(),
  sub: z.string().nullable().optional(),
  upload_credentials: UploadCredentialsSchema.optional(),
  meta: MetaSchema.optional(),
  viatars: ViatarListSchema.optional()
});

export type ProbandRequest = z.infer<typeof ProbandRequestSchema>;

export type ProbandResponse = z.infer<typeof ProbandResponseSchema>;
