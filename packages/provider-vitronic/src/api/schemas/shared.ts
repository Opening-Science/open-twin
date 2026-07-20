import { z } from 'zod/v4';
import { AngleListSchema } from './angle';
import { AxesListSchema } from './axes';
import { CrossSectionListSchema } from './crosssection';
import { DistanceListSchema } from './distance';
import { HeightListSchema } from './height';
import { MarkerListSchema } from './marker';
import { PropertyListSchema } from './properties';

export const TokenSchema = z
  .object({
    access_token: z.string(),
    token_type: z.string(),
    expires_in: z.number()
  })
  .transform((data) => {
    return {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_at: new Date(Date.now() + data.expires_in * 1000)
    };
  });

export type Token = z.infer<typeof TokenSchema>;

export const MEASUREMENT_SCHEMAS = {
  angle: AngleListSchema,
  distance: DistanceListSchema,
  height: HeightListSchema,
  properties: PropertyListSchema,
  marker: MarkerListSchema,
  axis: AxesListSchema,
  cross_section: CrossSectionListSchema
} as const;

export type Scope = keyof typeof MEASUREMENT_SCHEMAS;

export type MeasurementData<T extends Scope> = z.infer<(typeof MEASUREMENT_SCHEMAS)[T]>;
