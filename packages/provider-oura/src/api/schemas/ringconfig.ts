import { z } from 'zod';
import { ResponseParams } from './client';

export const RingConfigSchema = z.object({
  id: z.string().nonempty(),
  set_up_at: z.string().optional().nullable(), // UTC datetime string
  hardware_type: z.enum(['gen1', 'gen2', 'gen2m', 'gen3', 'gen4', 'or5']).optional().nullable(),
  color: z
    .enum([
      'brushed_silver',
      'glossy_black',
      'glossy_gold',
      'glossy_white',
      'gucci',
      'matt_gold',
      'rose',
      'silver',
      'stealth_black',
      'titanium',
      'titanium_and_gold',
      'cloud',
      'petal',
      'midnight',
      'tide',
      'deep_rose'
    ])
    .optional()
    .nullable(),
  design: z.enum(['heritage', 'balance', 'balance_diamond', 'horizon', 'ceramic']).optional().nullable(),
  firmware_version: z.string().optional().nullable(),
  size: z.number().int().optional().nullable()
});

export const RingConfigListSchema = ResponseParams.extend({
  data: z.array(RingConfigSchema)
});

export type OuraRingConfigResponseList = z.infer<typeof RingConfigListSchema>;
export type OuraRingConfigItem = z.infer<typeof RingConfigSchema>;
