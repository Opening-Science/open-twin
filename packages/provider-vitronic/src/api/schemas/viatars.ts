import { z } from 'zod/v4';

const StateSchema = z.object({
  status: z.string(),
  progress: z.number(),
  description: z.string(),
  notification: z.array(z.string()).optional()
});

const MetaSchema = z.object({
  crtime: z.string(),
  mtime: z.string()
});

export const ViatarSchema = z.object({
  proband_id: z.number(),
  parameters: z.object({
    mesh_3d: z.object({
      detail: z.string(),
      texture: z.boolean()
    }),
    avatar_3d: z.object({
      model: z.string(),
      clothing: z.string(),
      reverse: z.boolean()
    }),
    analyzed_avatar_3d: z.object({
      preset_id: z.number()
    })
  }),
  targets: z.object({
    imageset_2d: z.object({
      state: StateSchema,
      meta: MetaSchema
    }),
    coarse_pointcloud_3d: z.object({
      state: StateSchema,
      meta: MetaSchema
    }),
    mesh_3d: z.object({
      state: StateSchema,
      meta: MetaSchema
    }),
    avatar_3d: z.object({
      state: StateSchema,
      meta: MetaSchema
    }),
    analyzed_avatar_3d: z.object({
      state: StateSchema,
      meta: MetaSchema
    }),
    report: z.object({
      state: StateSchema
    })
  }),
  observations: z.object({
    weight: z.number()
  }),
  scan_folder: z.string(),
  viatar_id: z.number(),
  meta: MetaSchema
});

export const ViatarRequestSchema = z.object({
  proband_id: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
  key_external: z.string().nullable().optional(),

  parameters: z
    .object({
      title: z.string().default(''),
      imageset_2d: z
        .object({
          exposure_time: z.number().min(1.0).max(500000.0).nullable().optional(),
          projector_brightness: z.number().min(0.0).max(100.0).nullable().optional(),
          ring_brightness: z.number().min(0.0).max(100.0).nullable().optional(),
          keep_images: z.boolean().nullable().optional()
        })
        .optional(),
      mesh_3d: z
        .object({
          detail: z.enum(['High', 'Normal', 'Preview']).nullable().optional(),
          texture: z.boolean().nullable().optional()
        })
        .optional(),
      avatar_3d: z
        .object({
          pose: z.enum(['A-Pose', 'FreeScan']).nullable().optional(),
          model: z.enum(['No Model', 'A-Pose (Male)', 'A-Pose (Female)']).nullable().optional(),
          clothing: z.enum(['Tight', 'Loose']).nullable().optional(),
          reverse: z.boolean().nullable().optional()
        })
        .optional(),
      analyzed_avatar_3d: z
        .object({
          preset_id: z.number().int().nullable().optional(),
          palp_snap_distance: z.number().nullable().optional(),
          orphaned_palpation_marker: z.boolean().nullable().optional()
        })
        .optional(),
      report: z
        .object({
          preset: z.literal('Default').nullable().optional()
        })
        .optional(),
      observations: z
        .object({
          weight: z
            .object({
              source: z.literal('PHD').nullable().optional()
            })
            .optional()
        })
        .optional()
    })
    .optional(),

  applied_presets: z.array(z.number().int()).nullable().optional(),
  scan_folder: z.string().nullable().optional()
});

export const ViatarListSchema = z.array(z.string());

export type Viatar = z.infer<typeof ViatarSchema>;
export type ViatarList = z.infer<typeof ViatarListSchema>;
export type ViatarRequest = z.infer<typeof ViatarRequestSchema>;
