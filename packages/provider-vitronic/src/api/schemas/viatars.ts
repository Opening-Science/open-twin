/**
 * WHAT: Zod (or typed) schema for a vendor/API payload shape.
 * NOT:  Must not map to FHIR or choose LOINC/UCUM; mappers and fhir-core own that.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Schema optional fields are not discriminators for response type (ADR 0005).
 */
import { z } from 'zod/v4';

export const StateSchema = z.object({
  status: z.string().nullable().optional(),
  progress: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  notification: z.array(z.string()).nullable().optional()
});

// `crtime` becomes `Observation.effective[x]`, so an unparseable timestamp must
// fail at the API boundary rather than land in a FHIR instant field. BodyLoop
// may or may not send an offset, so both forms are accepted here and narrowed
// where they are mapped. `proband.ts` types the same two fields the same way.
export const MetaSchema = z
  .object({
    crtime: z.iso.datetime({ offset: true, local: true }).nullable().optional(),
    mtime: z.iso.datetime({ offset: true, local: true }).nullable().optional(),
    info: z.string().nullable().optional()
  })
  .nullable();

export const TargetSchema = z.object({
  state: StateSchema.optional(),
  meta: MetaSchema.optional()
});

export const ViatarSchema = z.object({
  viatar_id: z.number().int(),
  proband_id: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
  key_external: z.string().nullable().optional(),
  scan_folder: z.string().nullable().optional(),

  parameters: z.record(z.string(), z.unknown()).nullable().optional(),

  targets: z.record(z.string(), TargetSchema).nullable().optional(),

  observations: z.record(z.string(), z.unknown()).nullable().optional(),

  meta: MetaSchema.optional()
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

export const ViatarListSchema = z.array(ViatarSchema);

export type Viatar = z.infer<typeof ViatarSchema>;
export type ViatarList = z.infer<typeof ViatarListSchema>;
export type ViatarRequest = z.infer<typeof ViatarRequestSchema>;
