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

const CrossSectionAreaSchema = z.object({
  convex_area: z.number(),
  perimeter_area: z.number()
});

const CrossSectionSchema = CommonTypeSchema.extend({
  crosssection_path: z.string(),
  preference: z.string().nullable(),
  circumferences: z.object({
    convex_circumference: z.number(),
    perimeter_circumference: z.number()
  }),
  areas: CrossSectionAreaSchema.optional(),
  contours: z.object({
    convex_contour: z.object({
      '3D': z.array(z.tuple([z.number(), z.number(), z.number()])),
      '2D': z.array(z.tuple([z.number(), z.number()]))
    }),
    perimeter_contour: z.object({
      '3D': z.array(z.tuple([z.number(), z.number(), z.number()])),
      '2D': z.array(z.tuple([z.number(), z.number()]))
    })
  }),
  skeletonPosition: z.object({
    series_path: z.string(),
    distanceFromRoot: z.number()
  }),
  details: z.object({
    at_marker: MarkerSchema
  })
});

export const CrossSectionListSchema = z.array(CrossSectionSchema);

export type CrossSection = z.infer<typeof CrossSectionSchema>;
export type CrossSectionList = z.infer<typeof CrossSectionListSchema>;
