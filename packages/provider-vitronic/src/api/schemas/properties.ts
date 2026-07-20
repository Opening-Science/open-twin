import { z } from 'zod/v4';

export const PropertySchema = z.object({
  property_path: z.string(),
  value: z.any(),
  label: z.string().nullable(),
  note: z.string().nullable(),
  style: z.string().nullable(),
  key_external: z.string().nullable(),
  hidden: z.boolean()
});

export const PropertyListSchema = z.array(PropertySchema);

export type Property = z.infer<typeof PropertySchema>;
export type PropertyList = z.infer<typeof PropertyListSchema>;
