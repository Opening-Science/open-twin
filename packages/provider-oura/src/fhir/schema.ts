import { z } from "zod";

export const CodingSchema = z.object({
  system: z.url().optional(),
  code: z.string().optional(),
  display: z.string().optional(),
});

export const CodeableConceptSchema = z.object({
  coding: z.array(CodingSchema).optional(),
  text: z.string().optional(),
});

export const ReferenceSchema = z.object({
  reference: z.string().optional(),
  display: z.string().optional(),
});

export const QuantitySchema = z.object({
  value: z.number().optional(),
  unit: z.string().optional(),
  system: z.url().optional(),
  code: z.string().optional(),
});

export const ObservationSchema = z.object({
  resourceType: z.literal("Observation"),
  id: z.string().optional(),
  status: z.enum([
    "registered",
    "preliminary",
    "final",
    "amended",
    "corrected",
    "cancelled",
    "entered-in-error",
    "unknown",
  ]),
  category: z.array(CodeableConceptSchema).optional(),
  code: CodeableConceptSchema,
  subject: ReferenceSchema.optional(),
  effectiveDateTime: z.iso.datetime({ offset: true }).optional(), // Enforces ISO 8601
  valueQuantity: QuantitySchema.optional(),
  device: ReferenceSchema.optional(),
});

export const BundleEntrySchema = z.object({
  resource: ObservationSchema,
});

export const BundleSchema = z.object({
  resourceType: z.literal("Bundle"),
  type: z.enum([
    "document",
    "message",
    "transaction",
    "transaction-response",
    "batch",
    "batch-response",
    "history",
    "searchset",
    "collection",
  ]),
  entry: z.array(BundleEntrySchema).optional(),
});

export type FhirObservation = z.infer<typeof ObservationSchema>;
export type FhirBundle = z.infer<typeof BundleSchema>;
