import { z } from "zod";

// Citation: https://hl7.org/fhir/R4/datatypes.html#Coding
const codingSchema = z.object({
  system: z.string().optional(), // Changed from z.url() to support URNs
  code: z.string().optional(),
  display: z.string().optional(),
});

// Citation: https://hl7.org/fhir/R4/datatypes.html#CodeableConcept
const codeableConceptSchema = z.object({
  coding: z.array(codingSchema).optional(),
  text: z.string().optional(),
});

// Citation: https://hl7.org/fhir/R4/datatypes.html#Quantity
const quantitySchema = z.object({
  value: z.number().optional(),
  unit: z.string().optional(),
  system: z.string().optional(),
  code: z.string().optional(),
});

// Citation: https://hl7.org/fhir/R4/datatypes.html#Period
const periodSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
});

// Citation: https://hl7.org/fhir/R4/extensibility.html#Extension
const extensionSchema = z.object({
  url: z.string(),
  valueString: z.string().optional(),
});

// Citation: https://hl7.org/fhir/R4/observation.html
export const FhirSchema = z.object({
  resourceType: z.literal("Observation"),
  identifier: z
    .array(
      z.object({
        system: z.string().optional(),
        value: z.string().optional(),
      }),
    )
    .optional(),

  // Observation status requires specific values
  status: z.enum([
    "registered",
    "preliminary",
    "final",
    "amended",
    "cancelled",
    "entered-in-error",
    "unknown",
  ]),

  category: z.array(codeableConceptSchema).optional(),

  // Code is strictly required (1..1) in FHIR R4
  code: codeableConceptSchema,

  subject: z
    .object({
      reference: z.string().regex(/^Patient\/[A-Za-z0-9\-\.]{1,64}$/),
    })
    .optional(),

  // effective[x]
  effectiveDateTime: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid ISO date string",
    })
    .optional(),
  effectivePeriod: periodSchema.optional(),

  valueQuantity: quantitySchema.optional(),

  component: z
    .array(
      z.object({
        code: codeableConceptSchema,
        valueQuantity: quantitySchema.optional(),
      }),
    )
    .optional(),

  // Fields mapped from Oura
  extension: z.array(extensionSchema).optional(),
  device: z.object({ reference: z.string() }).optional(),
  method: codeableConceptSchema.optional(),
  note: z.array(z.object({ text: z.string() })).optional(),
});

export type FhirObservation = z.infer<typeof FhirSchema>;
