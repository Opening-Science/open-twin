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

export const ViatarListSchema = z.array(z.string());

export type Viatar = z.infer<typeof ViatarSchema>;
export type ViatarList = z.infer<typeof ViatarListSchema>;
