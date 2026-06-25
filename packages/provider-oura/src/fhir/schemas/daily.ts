import { z } from "zod";

// Reusable FHIR R4 building blocks shared across the daily activity Observation.
const codingSchema = z.object({
  system: z.url(),
  code: z.string().nonempty(),
  display: z.string().nonempty(),
});

const codeableConceptSchema = z.object({
  // FHIR requires at least one coding entry within a CodeableConcept.
  coding: z.array(codingSchema).min(1),
});

const quantitySchema = z.object({
  value: z.number(),
  unit: z.string().nonempty(),
  system: z.url(),
  code: z.string().nonempty(),
});

export const dailyActivityFhirSchema = z.object({
  resourceType: z.literal("Observation"),
  id: z.string().nonempty(),
  status: z.literal("final"),
  category: z.array(codeableConceptSchema).min(1),
  code: codeableConceptSchema,
  subject: z.object({
    reference: z.string().regex(/^Patient\/[A-Za-z0-9\-\.]{1,64}$/),
  }),
  effectiveDateTime: z.iso.datetime({ offset: true }),
  valueQuantity: quantitySchema,
  component: z
    .array(
      z.object({
        code: codeableConceptSchema,
        valueQuantity: quantitySchema,
      }),
    )
    .optional(),
});

export type DailyActivityFhir = z.infer<typeof dailyActivityFhirSchema>;
