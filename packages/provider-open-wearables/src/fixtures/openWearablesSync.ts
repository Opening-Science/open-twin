/**
 * WHAT: Exported fixture payload for tests and verification.
 * NOT:  Must not be mistaken for a live recorded vendor capture unless documented as such.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
const OW_USER_ID = '00000000-0000-0000-0000-000000000002';

/** `_SOURCE_GARMIN`, `_SOURCE_OURA`, `_SOURCE_APPLE` — test_payloads.py:16-18. */
const SOURCE_GARMIN = { provider: 'garmin', device: 'Garmin Fenix 7' };
const SOURCE_OURA = { provider: 'oura', device: 'Oura Ring Gen3' };

/**
 * `_ts_payload` gives every sample `"source": {"provider": provider, "device": None}`
 * and `"zone_offset": "+00:00"` (test_payloads.py:23, 36).
 */
function reproduced(type: string, provider: string, unit: string, value: number): unknown {
  return {
    timestamp: '2024-01-01T08:00:00+00:00',
    zone_offset: '+00:00',
    type,
    value,
    unit,
    source: { provider, device: null },
    is_daily_total: null
  };
}

export const TIMESERIES_PAGE: unknown = {
  data: [
    // ---- Reproduced verbatim from EXAMPLE_PAYLOADS. -------------------------
    // SERIES_HEART_RATE (test_payloads.py:164-166)
    reproduced('heart_rate', 'garmin', 'bpm', 72.0),
    // SERIES_RESTING_HEART_RATE (test_payloads.py:167-169)
    reproduced('resting_heart_rate', 'garmin', 'bpm', 52.0),
    // SPO2_CREATED (test_payloads.py:126) — note the unit is "%" here while
    // SERIES_TYPE_DEFINITIONS declares "percent" for the same series type.
    reproduced('oxygen_saturation', 'oura', '%', 97.0),
    // RESPIRATORY_RATE_CREATED (test_payloads.py:127-129) — "breaths/min" against
    // a declared "brpm".
    reproduced('respiratory_rate', 'oura', 'breaths/min', 14.5),
    // SERIES_BODY_TEMPERATURE (test_payloads.py:259-261)
    reproduced('body_temperature', 'apple', '°C', 36.6),
    // SERIES_HEIGHT (test_payloads.py:238)
    reproduced('height', 'apple', 'cm', 178.0),
    // SERIES_WEIGHT (test_payloads.py:239)
    reproduced('weight', 'garmin', 'kg', 75.4),
    // SERIES_VO2_MAX (test_payloads.py:283-285)
    reproduced('vo2_max', 'garmin', 'mL/kg/min', 52.0),
    // SERIES_HEART_RATE_VARIABILITY_SDNN (test_payloads.py:180-182)
    reproduced('heart_rate_variability_sdnn', 'oura', 'ms', 48.0),
    // SERIES_SKIN_TEMPERATURE_DEVIATION (test_payloads.py:265-267) — a deviation,
    // which this connector emits as UCUM `K` rather than `Cel`.
    reproduced('skin_temperature_deviation', 'oura', '°C', -0.3),
    // SERIES_STEPS (test_payloads.py:294)
    reproduced('steps', 'garmin', 'count', 8432.0),
    // SERIES_ENERGY (test_payloads.py:295)
    reproduced('energy', 'garmin', 'kcal', 320.0),
    // SERIES_DISTANCE_WALKING_RUNNING (test_payloads.py:333-335)
    reproduced('distance_walking_running', 'apple', 'm', 6240.0),

    // ---- Reproduced, and refused by this connector. -------------------------
    // SERIES_BLOOD_PRESSURE_SYSTOLIC (test_payloads.py:208-210). Both sources
    // agree the unit is mmHg; @open-twin/fhir-core has no UCUM entry for it.
    reproduced('blood_pressure_systolic', 'garmin', 'mmHg', 118.0),
    // SERIES_BLOOD_ALCOHOL_CONTENT (test_payloads.py:201-203). Sent as g/dL here,
    // declared mg_dl in series_types.py:197. A factor of a thousand apart.
    reproduced('blood_alcohol_content', 'apple', 'g/dL', 0.0),
    // SERIES_WALKING_STEP_LENGTH (test_payloads.py:363-365). Sent as 0.72 m,
    // declared cm in series_types.py:247.
    reproduced('walking_step_length', 'apple', 'm', 0.72),
    // RECOVERY_SCORE_CREATED (test_payloads.py:148-150) and the docs' timeseries
    // table both list `recovery_score`, but it is absent from the SeriesType enum
    // in series_types.py. Unknown to this connector by construction.
    reproduced('recovery_score', 'oura', 'score', 78.0),

    // ---- Constructed, not reproduced. ---------------------------------------
    // A daily step total. `is_daily_total` is documented at
    // data_point_responses.py:18-20 but no example payload sets it, so this record
    // exercises the 24-hour code path with a value taken from the steps example.
    {
      timestamp: '2024-01-01T23:59:00+00:00',
      zone_offset: '+00:00',
      type: 'steps',
      value: 8432.0,
      unit: 'count',
      source: { provider: 'garmin', device: null },
      is_daily_total: true
    },
    // A sample east of UTC. Every example payload is at +00:00, where a connector
    // that drops the offset looks correct; D7 exists because that is precisely the
    // case in which the defect hides.
    {
      timestamp: '2024-01-01T22:30:00+00:00',
      zone_offset: '+02:00',
      type: 'heart_rate',
      value: 58.0,
      unit: 'bpm',
      source: SOURCE_OURA,
      is_daily_total: false
    }
  ],
  pagination: { next_cursor: null, previous_cursor: null, has_more: false, total_count: 19 },
  metadata: {
    resolution: 'raw',
    sample_count: 19,
    start_time: '2024-01-01T00:00:00+00:00',
    end_time: '2024-01-02T00:00:00+00:00'
  }
};

/**
 * Reproduced from `WebhookEventType.SLEEP_CREATED` (test_payloads.py:93-112).
 *
 * That payload carries no `sleep_duration_seconds`, so the mapped Observation has
 * no value and a `dataAbsentReason` instead. That is the correct outcome and it is
 * kept rather than patched: filling the gap with `duration_seconds` would publish
 * time in bed as time asleep, and filling it with zero would publish a night of no
 * sleep at all.
 */
export const SLEEP_PAGE: unknown = {
  data: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      start_time: '2024-01-01T22:00:00+00:00',
      end_time: '2024-01-02T06:30:00+00:00',
      zone_offset: '+00:00',
      duration_seconds: 30600,
      source: SOURCE_OURA,
      efficiency_percent: 88.5,
      stages: { awake_minutes: 12, light_minutes: 210, deep_minutes: 90, rem_minutes: 95 },
      is_nap: false
    },
    // Constructed: a nap with a stated sleep duration, so the mapped bundle covers
    // both the valued and the value-absent branch of the same mapper.
    {
      id: '00000000-0000-0000-0000-0000000000a1',
      start_time: '2024-01-02T13:15:00+00:00',
      end_time: '2024-01-02T13:47:00+00:00',
      zone_offset: '+02:00',
      duration_seconds: 1920,
      sleep_duration_seconds: 1680,
      source: SOURCE_OURA,
      is_nap: true
    }
  ],
  pagination: { next_cursor: null, previous_cursor: null, has_more: false, total_count: 2 }
};

/** Reproduced from `WebhookEventType.WORKOUT_CREATED` (test_payloads.py:74-92). */
export const WORKOUT_PAGE: unknown = {
  data: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      user_id: OW_USER_ID,
      type: 'running',
      start_time: '2024-01-01T08:00:00+00:00',
      end_time: '2024-01-01T09:00:00+00:00',
      zone_offset: '+00:00',
      duration_seconds: 3600,
      source: SOURCE_GARMIN,
      calories_kcal: 450.0,
      distance_meters: 8500.0,
      avg_heart_rate_bpm: 155,
      max_heart_rate_bpm: 178,
      avg_pace_sec_per_km: 424,
      elevation_gain_meters: 120.0
    }
  ],
  pagination: { next_cursor: null, previous_cursor: null, has_more: false, total_count: 1 }
};

/** The user id used throughout the platform's own example payloads (line 12). */
export const FIXTURE_USER_ID = OW_USER_ID;
