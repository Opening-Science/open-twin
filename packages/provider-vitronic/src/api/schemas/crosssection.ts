import { z } from 'zod/v4';
import { CommonTypeSchema } from './common';
import { MarkerSchema } from './marker';

export const CrossSectionSchema = CommonTypeSchema.extend({
  crosssection_path: z.string(),
  preference: z.string().nullable(),
  circumferences: z.object({
    convex_circumference: z.number(),
    perimeter_circumference: z.number()
  }),
  ares: z.object({
    convex_area: z.number(),
    perimeter_area: z.number()
  }),
  contours: z.object({
    convex_contour: z.object({
      '3D': z.array(z.tuple([z.number(), z.number(), z.number()])),
      '2D': z.array(z.tuple([z.number(), z.number()]))
    }),
    perimeter_contour: z.array(z.tuple([z.number(), z.number()]))
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
