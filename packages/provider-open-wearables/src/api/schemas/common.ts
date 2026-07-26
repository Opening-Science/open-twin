import { z } from 'zod/v4';

/**
 * Shapes taken verbatim from the Open Wearables FastAPI response models. Every
 * field below is quoted, with its source file and line, in
 * `docs/open-wearables-contract.md`.
 *
 * Optionality follows the pydantic declarations exactly: a field declared
 * `X | None = None` is `.nullable().optional()` here, because FastAPI omits unset
 * optional fields from the JSON body in some serialisation modes and emits `null`
 * in others. Treating "omitted" and "null" as different states would make the
 * parser reject valid responses.
 */

/**
 * `SourceMetadata` — backend/app/schemas/utils/metadata.py:7-9.
 *
 *   provider: str = Field(..., example="apple_health")
 *   device: str | None = Field(None, example="Apple Watch Series 9")
 *
 * `provider` is the string the platform stored for the data source, not the
 * `ProviderName` enum: `timeseries_service.get_timeseries` builds it as
 * `data_source.source or "unknown"` (backend/app/services/timeseries_service.py:192).
 * So it must be parsed as a free string, never as an enum.
 */
export const SourceMetadataSchema = z.object({
  provider: z.string(),
  device: z.string().nullable().optional()
});

/**
 * `ZoneOffset` — backend/app/utils/dates.py:30-40, pattern `^[+-]\d{2}:\d{2}$`.
 * A literal "Z" is normalised to "+00:00" server-side by `_normalize_zone_offset`,
 * so the wire value always matches the pattern; the pattern is re-applied here
 * because D7 makes the offset load-bearing and a malformed one must not be guessed.
 */
export const ZoneOffsetSchema = z.string().regex(/^[+-]\d{2}:\d{2}$/);

/** `Pagination` — backend/app/schemas/utils/pagination.py:9-21. */
export const PaginationSchema = z.object({
  next_cursor: z.string().nullable().optional(),
  previous_cursor: z.string().nullable().optional(),
  has_more: z.boolean(),
  total_count: z.number().nullable().optional()
});

/** `TimeseriesMetadata` — backend/app/schemas/utils/metadata.py:12-16. */
export const TimeseriesMetadataSchema = z.object({
  resolution: z.string().nullable().optional(),
  sample_count: z.number().nullable().optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional()
});

/**
 * `PaginatedResponse[DataT]` — backend/app/schemas/utils/pagination.py:24-35.
 * `metadata` is declared non-optional there, but is tolerated as absent here so a
 * caller can hand this package a bare page of data without fabricating metadata it
 * does not have.
 */
export function paginatedResponse<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    pagination: PaginationSchema.optional(),
    metadata: TimeseriesMetadataSchema.optional()
  });
}

export type SourceMetadata = z.infer<typeof SourceMetadataSchema>;
