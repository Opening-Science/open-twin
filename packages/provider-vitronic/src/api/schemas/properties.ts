import { z } from 'zod/v4';

import { CommonTypeSchema } from './common';

export const PropertySchema = CommonTypeSchema.extend({
  property_path: z.string(),
  value: z.unknown()
});

export const PropertyListSchema = z.array(PropertySchema);

export type Property = z.infer<typeof PropertySchema>;
export type PropertyList = z.infer<typeof PropertyListSchema>;
