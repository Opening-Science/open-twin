/**
 * WHAT: Zod (or typed) schema for a vendor/API payload shape.
 * NOT:  Must not map to FHIR or choose LOINC/UCUM; mappers and fhir-core own that.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Schema optional fields are not discriminators for response type (ADR 0005).
 */
import { z } from 'zod/v4';
import { paginatedResponse, SourceMetadataSchema, ZoneOffsetSchema } from './common';

/**
 * `TimeSeriesSample` — backend/app/schemas/responses/activity/data_point_responses.py:11-20:
 *
 *   timestamp: datetime
 *   zone_offset: ZoneOffset = None
 *   type: SeriesType
 *   value: float | int
 *   unit: str
 *   source: SourceMetadata | None = None
 *   is_daily_total: bool | None = None
 *
 * `type` is deliberately parsed as a free string rather than as the `SeriesType`
 * enum. The enum has ~90 members and grows; a new member upstream would otherwise
 * make this parser reject an entire page of otherwise-valid samples. Unknown types
 * are reported as unmapped by the mapper instead (D6: absence is not an exception).
 *
 * `unit` is likewise a free string, and it is *not* trusted. See `seriesMap.ts`:
 * the platform's own example payloads disagree with its own unit table for several
 * series types, one of them by a factor of a thousand.
 */
export const TimeSeriesSampleSchema = z.object({
  timestamp: z.string(),
  zone_offset: ZoneOffsetSchema.nullable().optional(),
  type: z.string(),
  value: z.number(),
  unit: z.string(),
  source: SourceMetadataSchema.nullable().optional(),
  is_daily_total: z.boolean().nullable().optional()
});

export const TimeSeriesPageSchema = paginatedResponse(TimeSeriesSampleSchema);

export type TimeSeriesSample = z.infer<typeof TimeSeriesSampleSchema>;
export type TimeSeriesPage = z.infer<typeof TimeSeriesPageSchema>;
