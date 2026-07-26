import {
  type CategoryKey,
  type CodingInput,
  ConnectorError,
  LOINC_UNITS,
  PROFILES,
  SYSTEMS,
  UCUM,
  type UcumUnit
} from '@open-twin/fhir-core';
import { CONNECTOR, OPEN_WEARABLES_SYSTEM } from '../config/constants';

/**
 * How one Open Wearables `SeriesType` becomes one FHIR Observation.
 *
 * Two independent primary sources were used for every entry, and they are quoted
 * with URLs in `docs/open-wearables-contract.md`:
 *
 *  A. `SERIES_TYPE_DEFINITIONS` in backend/app/schemas/enums/series_types.py, the
 *     table the API itself reads: `timeseries_service.get_timeseries` sets the
 *     response `unit` to `get_series_type_unit(series_type)`
 *     (backend/app/services/timeseries_service.py:185-203). This is the closest
 *     thing to a unit contract the platform has.
 *  B. `EXAMPLE_PAYLOADS` in backend/app/constants/webhooks/test_payloads.py, the
 *     platform's own hand-written sample payload for each series type.
 *
 * **They disagree.** Not only in spelling — `percent` vs `%`, `celsius` vs `°C` —
 * but in dimension. `blood_alcohol_content` is declared `mg_dl` in (A) and sent as
 * `g/dL` in (B), a factor of a thousand. `walking_step_length` is declared `cm` in
 * (A) and exemplified as `0.72 m` in (B); 0.72 cm is not a step. `physical_effort`
 * is `score` in (A) and `MET·min` in (B). `stair_ascent_speed` is `m_per_s` in (A)
 * and `floors/min` in (B).
 *
 * That is why this file exists rather than a `unit` passthrough, and why a series
 * type is mapped only when both sources agree. Everything else is enumerated in
 * `UNRESOLVED_SERIES` and refused — refusing is recoverable, publishing a
 * thousand-fold unit error under a standard code is not.
 *
 * No live Open Wearables instance was available (see README). Neither source has
 * been checked against a running server, and both could be stale relative to it.
 */

export interface Measure {
  /**
   * Most specific coding first.
   *
   * More than one coding is not decoration. The R4 vital-signs profiles each
   * require a particular LOINC "magic code" to be present and allow more precise
   * ones alongside it — `oxygensat` requires 2708-6 and permits 59408-5, and the
   * validator applies `heartrate` to LOINC 40443-4 and then demands 8867-4. Sending
   * only the precise code is a conformance failure; sending only the magic code
   * throws away the precision. Both, specific first, is the profile's own design.
   *
   * Source: http://hl7.org/fhir/R4/oxygensat.html and http://hl7.org/fhir/R4/heartrate.html.
   * Found by running the HL7 validator, not by reading the specification.
   */
  codes: readonly CodingInput[];
  unit: UcumUnit;
  category: CategoryKey;
  profiles?: readonly string[];
}

export interface SeriesMapping {
  /** The unit string in `SERIES_TYPE_DEFINITIONS`, i.e. what the API will send. */
  declaredUnit: string;
  /**
   * Every unit spelling seen in a primary source for this type. A sample whose
   * `unit` is not one of these is refused: an unrecognised unit means the source
   * this package was written against no longer describes the server it is talking
   * to, and at that point the safe reading of a number is that there isn't one.
   */
  acceptedUnits: readonly string[];
  /** Used when `is_daily_total` is not `true`. */
  sample: Measure;
  /**
   * Used when `is_daily_total === true`. Absent means daily totals of this type are
   * refused rather than published under a point-in-time code: "8432" as a daily
   * step total and "8432" as an instantaneous reading are different assertions, and
   * only the code can carry the difference.
   */
  dailyTotal?: Measure;
}

/**
 * A LOINC-coded measure. The unit is *looked up*, never chosen here: D4 binds each
 * LOINC code to exactly one (unit, UCUM code) pair in `@open-twin/fhir-core`, and
 * reading it rather than restating it makes it impossible for this connector to
 * emit LOINC 8302-2 in `m` while another emits it in `cm`.
 *
 * Codes and display strings are taken verbatim from `LOINC_UNITS`, which is the
 * repository's reviewed set. No LOINC code is introduced here that has not already
 * been through that review.
 */
export function loincUnit(code: string): UcumUnit {
  const unit = LOINC_UNITS[code];
  if (!unit) {
    throw new ConnectorError('LOINC code has no unit in the shared LOINC_UNITS table', {
      code: 'unsupported',
      connector: CONNECTOR.connector,
      operation: `LOINC ${code}`
    });
  }
  return unit;
}

interface LoincMeasureOptions {
  category: CategoryKey;
  profile?: string;
  /** A LOINC code an R4 profile requires in addition to the specific one. */
  alsoCode?: { code: string; display: string };
}

function loincMeasure(code: string, display: string, options: LoincMeasureOptions): Measure {
  const unit = loincUnit(code);
  const codes: CodingInput[] = [{ system: SYSTEMS.LOINC, code, display }];
  if (options.alsoCode) {
    codes.push({ system: SYSTEMS.LOINC, code: options.alsoCode.code, display: options.alsoCode.display });
  }
  return {
    codes,
    unit,
    category: options.category,
    ...(options.profile ? { profiles: [options.profile] as const } : {})
  };
}

/** A measure under the Foundation-controlled Open Wearables code system (D3). */
function localMeasure(code: string, display: string, unit: UcumUnit, category: CategoryKey): Measure {
  return { codes: [{ system: OPEN_WEARABLES_SYSTEM, code, display }], unit, category };
}

const PERCENT_SPELLINGS = ['percent', '%'] as const;
const CELSIUS_SPELLINGS = ['celsius', '°C'] as const;
const METRE_SPELLINGS = ['meters', 'm'] as const;
const MINUTE_SPELLINGS = ['minutes', 'min'] as const;
const SPEED_SPELLINGS = ['m_per_s', 'm/s'] as const;

/**
 * TODO(clinical-review): every `localMeasure` below is a vendor-local code because
 * no LOINC or SNOMED CT concept for it has been verified against a primary source.
 * A reviewer should either supply a standard code or confirm that a local one is
 * acceptable. Per the project's own precedent, abandoning a standard code that
 * exists is the more damaging of the two possible errors — a "no code exists"
 * claim is not being made here, only "none has been verified".
 */
export const SERIES_MAP: Readonly<Record<string, SeriesMapping>> = {
  // ---------------------------------------------------------------- vital signs
  heart_rate: {
    declaredUnit: 'bpm',
    acceptedUnits: ['bpm'],
    sample: loincMeasure('8867-4', 'Heart rate', { category: 'VITAL_SIGNS', profile: PROFILES.HEART_RATE })
  },
  resting_heart_rate: {
    declaredUnit: 'bpm',
    acceptedUnits: ['bpm'],
    // The validator applies the `heartrate` profile to 40443-4 whether or not it
    // is declared, and then requires 8867-4 to be present. Declaring the profile
    // and carrying both codes is therefore the only conformant option; a resting
    // heart rate really is a heart rate, so nothing is being asserted that is not
    // true. The alternative — dropping to 8867-4 alone — would lose the fact that
    // this reading is a resting one.
    sample: loincMeasure('40443-4', 'Heart rate --resting', {
      category: 'VITAL_SIGNS',
      profile: PROFILES.HEART_RATE,
      alsoCode: { code: '8867-4', display: 'Heart rate' }
    })
  },
  respiratory_rate: {
    declaredUnit: 'brpm',
    acceptedUnits: ['brpm', 'breaths/min'],
    // The `resprate` profile *fixes* `/min`, so the `{breaths}` annotation this
    // repository uses elsewhere is a conformance failure here, not a nicety.
    sample: loincMeasure('9279-1', 'Respiratory rate', {
      category: 'VITAL_SIGNS',
      profile: PROFILES.RESPIRATORY_RATE
    })
  },
  oxygen_saturation: {
    declaredUnit: 'percent',
    acceptedUnits: PERCENT_SPELLINGS,
    sample: loincMeasure('59408-5', 'Oxygen saturation in Arterial blood by Pulse oximetry', {
      category: 'VITAL_SIGNS',
      profile: PROFILES.OXYGEN_SATURATION,
      alsoCode: { code: '2708-6', display: 'Oxygen saturation in Arterial blood' }
    })
  },
  body_temperature: {
    declaredUnit: 'celsius',
    acceptedUnits: CELSIUS_SPELLINGS,
    sample: loincMeasure('8310-5', 'Body temperature', { category: 'VITAL_SIGNS', profile: PROFILES.BODY_TEMPERATURE })
  },
  height: {
    declaredUnit: 'cm',
    acceptedUnits: ['cm'],
    sample: loincMeasure('8302-2', 'Body height', { category: 'VITAL_SIGNS', profile: PROFILES.BODY_HEIGHT })
  },
  weight: {
    declaredUnit: 'kg',
    acceptedUnits: ['kg'],
    sample: loincMeasure('29463-7', 'Body weight', { category: 'VITAL_SIGNS', profile: PROFILES.BODY_WEIGHT })
  },

  // --------------------------------------------------- other LOINC-coded measures
  body_fat_percentage: {
    declaredUnit: 'percent',
    acceptedUnits: PERCENT_SPELLINGS,
    sample: loincMeasure('41982-0', 'Percentage of body fat', { category: 'EXAM' })
  },
  vo2_max: {
    declaredUnit: 'ml_kg_min',
    acceptedUnits: ['ml_kg_min', 'mL/kg/min'],
    sample: loincMeasure(
      '94122-9',
      'Oxygen consumption (VO2)/Body weight [Volume Rate Content] --peak during exercise',
      { category: 'ACTIVITY' }
    )
  },
  exercise_time: {
    declaredUnit: 'minutes',
    acceptedUnits: MINUTE_SPELLINGS,
    sample: loincMeasure('55411-3', 'Exercise duration', { category: 'ACTIVITY' })
  },
  steps: {
    declaredUnit: 'count',
    acceptedUnits: ['count'],
    sample: loincMeasure('55423-8', 'Number of steps in unspecified time Pedometer', { category: 'ACTIVITY' }),
    // 41950-7 carries a 24H time axis in the code itself, which is what makes the
    // `{steps}/d` denominator correct rather than decorative.
    dailyTotal: loincMeasure('41950-7', 'Number of steps in 24 hour Measured', { category: 'ACTIVITY' })
  },
  energy: {
    declaredUnit: 'kcal',
    acceptedUnits: ['kcal'],
    sample: loincMeasure('41981-2', 'Calories burned', { category: 'ACTIVITY' }),
    // LOINC 41979-6 "Calories burned in 24 hour" is the right concept for a daily
    // total, but it is absent from the shared LOINC_UNITS table, and choosing its
    // unit here would be exactly the per-connector unit drift D4 forbids. Local
    // code until 41979-6 is added there with a reviewed unit.
    // TODO(clinical-review): replace with LOINC 41979-6 once its unit is agreed.
    dailyTotal: localMeasure('energy-burned-24h', 'Active energy burned in 24 hour', UCUM.KILOCALORIE, 'ACTIVITY')
  },

  // ------------------------------------------------------------ vendor-local codes
  heart_rate_variability_sdnn: {
    declaredUnit: 'ms',
    acceptedUnits: ['ms'],
    sample: localMeasure('hrv-sdnn', 'Heart rate variability (SDNN)', UCUM.MILLISECOND, 'EXAM')
  },
  heart_rate_variability_rmssd: {
    declaredUnit: 'ms',
    acceptedUnits: ['ms'],
    sample: localMeasure('hrv-rmssd', 'Heart rate variability (RMSSD)', UCUM.MILLISECOND, 'EXAM')
  },
  heart_rate_recovery_one_minute: {
    declaredUnit: 'bpm',
    acceptedUnits: ['bpm'],
    sample: localMeasure('heart-rate-recovery-1min', 'Heart rate recovery after one minute', UCUM.PER_MINUTE, 'EXAM')
  },
  walking_heart_rate_average: {
    declaredUnit: 'bpm',
    acceptedUnits: ['bpm'],
    sample: localMeasure('walking-heart-rate-average', 'Average heart rate while walking', UCUM.PER_MINUTE, 'EXAM')
  },
  skin_temperature: {
    declaredUnit: 'celsius',
    acceptedUnits: CELSIUS_SPELLINGS,
    // Absolute temperature, so `Cel`. LOINC 8310-5 is body temperature and skin
    // temperature is a different measurement site, so it is not reused.
    sample: localMeasure('skin-temperature', 'Skin temperature', UCUM.CELSIUS, 'EXAM')
  },
  skin_temperature_deviation: {
    declaredUnit: 'celsius',
    acceptedUnits: CELSIUS_SPELLINGS,
    // A *difference* between two temperatures, which UCUM expresses as `K`, not
    // `Cel`: `Cel` is a special unit on an interval scale (UCUM §21-22) and cannot
    // take part in algebraic operations. The two are numerically equal as
    // intervals, so no value conversion happens — only the code changes. This
    // repository has already rejected the pair `°C|Cel` for exactly this case.
    sample: localMeasure('skin-temperature-deviation', 'Skin temperature deviation', UCUM.KELVIN, 'EXAM')
  },
  skin_temperature_trend_deviation: {
    declaredUnit: 'celsius',
    acceptedUnits: CELSIUS_SPELLINGS,
    sample: localMeasure('skin-temperature-trend-deviation', 'Skin temperature trend deviation', UCUM.KELVIN, 'EXAM')
  },
  lean_body_mass: {
    declaredUnit: 'kg',
    acceptedUnits: ['kg'],
    sample: localMeasure('lean-body-mass', 'Lean body mass', UCUM.KILOGRAM, 'EXAM')
  },
  body_fat_mass: {
    declaredUnit: 'kg',
    acceptedUnits: ['kg'],
    sample: localMeasure('body-fat-mass', 'Body fat mass', UCUM.KILOGRAM, 'EXAM')
  },
  skeletal_muscle_mass: {
    declaredUnit: 'kg',
    acceptedUnits: ['kg'],
    sample: localMeasure('skeletal-muscle-mass', 'Skeletal muscle mass', UCUM.KILOGRAM, 'EXAM')
  },
  waist_circumference: {
    declaredUnit: 'cm',
    acceptedUnits: ['cm'],
    sample: localMeasure('waist-circumference', 'Waist circumference', UCUM.CENTIMETRE, 'EXAM')
  },
  cardiovascular_age: {
    declaredUnit: 'years',
    acceptedUnits: ['years'],
    // This repository has already rejected LOINC 77195-6 (CAVI) for a vendor
    // "vascular age" in years: CAVI is a dimensionless ratio near 8, so an age of
    // 45 published under it reads as a clinically alarming CAVI. Local code.
    sample: localMeasure('cardiovascular-age', 'Estimated cardiovascular age', UCUM.YEAR, 'EXAM')
  },
  garmin_fitness_age: {
    declaredUnit: 'years',
    acceptedUnits: ['years'],
    sample: localMeasure('garmin-fitness-age', 'Garmin fitness age estimate', UCUM.YEAR, 'EXAM')
  },

  // ------------------------------------------------------------------- activity
  basal_energy: {
    declaredUnit: 'kcal',
    acceptedUnits: ['kcal'],
    sample: localMeasure('basal-energy', 'Basal energy burned', UCUM.KILOCALORIE, 'ACTIVITY')
  },
  active_time: {
    declaredUnit: 'minutes',
    acceptedUnits: MINUTE_SPELLINGS,
    sample: localMeasure('active-time', 'Provider-reported daily active time', UCUM.MINUTE, 'ACTIVITY')
  },
  stand_time: {
    declaredUnit: 'minutes',
    acceptedUnits: MINUTE_SPELLINGS,
    sample: localMeasure('stand-time', 'Time spent standing', UCUM.MINUTE, 'ACTIVITY')
  },
  flights_climbed: {
    declaredUnit: 'count',
    acceptedUnits: ['count'],
    sample: localMeasure('flights-climbed', 'Flights of stairs climbed', UCUM.COUNT, 'ACTIVITY')
  },
  distance_walking_running: {
    declaredUnit: 'meters',
    acceptedUnits: METRE_SPELLINGS,
    sample: localMeasure('distance-walking-running', 'Walking and running distance', UCUM.METRE, 'ACTIVITY')
  },
  distance_cycling: {
    declaredUnit: 'meters',
    acceptedUnits: METRE_SPELLINGS,
    sample: localMeasure('distance-cycling', 'Cycling distance', UCUM.METRE, 'ACTIVITY')
  },
  distance_swimming: {
    declaredUnit: 'meters',
    acceptedUnits: METRE_SPELLINGS,
    sample: localMeasure('distance-swimming', 'Swimming distance', UCUM.METRE, 'ACTIVITY')
  },
  distance_downhill_snow_sports: {
    declaredUnit: 'meters',
    acceptedUnits: METRE_SPELLINGS,
    sample: localMeasure('distance-downhill-snow-sports', 'Downhill snow sports distance', UCUM.METRE, 'ACTIVITY')
  },
  distance_other: {
    declaredUnit: 'meters',
    acceptedUnits: METRE_SPELLINGS,
    sample: localMeasure('distance-other', 'Other distance', UCUM.METRE, 'ACTIVITY')
  },
  six_minute_walk_test_distance: {
    declaredUnit: 'meters',
    acceptedUnits: METRE_SPELLINGS,
    sample: localMeasure('six-minute-walk-test-distance', 'Six-minute walk test distance', UCUM.METRE, 'ACTIVITY')
  },
  underwater_depth: {
    declaredUnit: 'meters',
    acceptedUnits: METRE_SPELLINGS,
    sample: localMeasure('underwater-depth', 'Underwater depth', UCUM.METRE, 'ACTIVITY')
  },
  speed: {
    declaredUnit: 'm_per_s',
    acceptedUnits: SPEED_SPELLINGS,
    sample: localMeasure('speed', 'Speed', UCUM.METRE_PER_SECOND, 'ACTIVITY')
  },
  walking_speed: {
    declaredUnit: 'm_per_s',
    acceptedUnits: SPEED_SPELLINGS,
    sample: localMeasure('walking-speed', 'Walking speed', UCUM.METRE_PER_SECOND, 'ACTIVITY')
  },
  running_speed: {
    declaredUnit: 'm_per_s',
    acceptedUnits: SPEED_SPELLINGS,
    sample: localMeasure('running-speed', 'Running speed', UCUM.METRE_PER_SECOND, 'ACTIVITY')
  },
  running_ground_contact_time: {
    declaredUnit: 'ms',
    acceptedUnits: ['ms'],
    sample: localMeasure('running-ground-contact-time', 'Running ground contact time', UCUM.MILLISECOND, 'ACTIVITY')
  },
  running_vertical_oscillation: {
    declaredUnit: 'cm',
    acceptedUnits: ['cm'],
    sample: localMeasure('running-vertical-oscillation', 'Running vertical oscillation', UCUM.CENTIMETRE, 'ACTIVITY')
  },
  swimming_stroke_count: {
    declaredUnit: 'count',
    acceptedUnits: ['count'],
    sample: localMeasure('swimming-stroke-count', 'Swimming stroke count', UCUM.COUNT, 'ACTIVITY')
  },
  push_count: {
    declaredUnit: 'count',
    acceptedUnits: ['count'],
    sample: localMeasure('push-count', 'Wheelchair push count', UCUM.COUNT, 'ACTIVITY')
  },
  time_in_daylight: {
    declaredUnit: 'minutes',
    acceptedUnits: MINUTE_SPELLINGS,
    // The published docs note this type is defined but not yet produced by any
    // provider. Mapped anyway: both sources agree on the unit, and a mapping that
    // is never exercised costs nothing, whereas a gap discovered on the day a
    // provider starts sending it costs a release.
    sample: localMeasure('time-in-daylight', 'Time in daylight', UCUM.MINUTE, 'ACTIVITY')
  },
  walking_double_support_percentage: {
    declaredUnit: 'percent',
    acceptedUnits: PERCENT_SPELLINGS,
    sample: localMeasure('walking-double-support-percentage', 'Double support time', UCUM.PERCENT, 'ACTIVITY')
  },
  walking_asymmetry_percentage: {
    declaredUnit: 'percent',
    acceptedUnits: PERCENT_SPELLINGS,
    sample: localMeasure('walking-asymmetry-percentage', 'Gait asymmetry', UCUM.PERCENT, 'ACTIVITY')
  },
  walking_steadiness: {
    declaredUnit: 'percent',
    acceptedUnits: PERCENT_SPELLINGS,
    sample: localMeasure('walking-steadiness', 'Walking steadiness', UCUM.PERCENT, 'ACTIVITY')
  },
  average_met: {
    declaredUnit: 'met',
    acceptedUnits: ['met', 'MET'],
    sample: localMeasure('average-met', 'Average metabolic equivalent', UCUM.MET, 'ACTIVITY')
  },

  // --------------------------------------------------------------------- scores
  garmin_stress_level: {
    declaredUnit: 'score',
    acceptedUnits: ['score'],
    sample: localMeasure('garmin-stress-level', 'Garmin stress score', UCUM.SCORE, 'SURVEY')
  },
  workout_effort_score: {
    declaredUnit: 'score',
    acceptedUnits: ['score'],
    sample: localMeasure('workout-effort-score', 'Workout effort score', UCUM.SCORE, 'SURVEY')
  },
  estimated_workout_effort_score: {
    declaredUnit: 'score',
    acceptedUnits: ['score'],
    sample: localMeasure('estimated-workout-effort-score', 'Estimated workout effort score', UCUM.SCORE, 'SURVEY')
  },
  number_of_times_fallen: {
    declaredUnit: 'count',
    acceptedUnits: ['count'],
    sample: localMeasure('number-of-times-fallen', 'Number of times fallen', UCUM.COUNT, 'SURVEY')
  }
};

/** Why a series type the platform supports is deliberately not mapped. */
export type RefusalReason =
  /** Two primary sources give incompatible units for the same series type. */
  | 'unit-conflict'
  /** Both sources agree, but `@open-twin/fhir-core` has no UCUM entry for the unit. */
  | 'no-ucum-code'
  /** Only one primary source mentions the unit, so nothing corroborates it. */
  | 'single-source'
  /** The value is not a property of the subject's body. */
  | 'not-a-patient-observation'
  /** FHIR models this as something other than an Observation with a Quantity. */
  | 'wrong-fhir-element';

export interface Refusal {
  reason: RefusalReason;
  /** Stated so a reader can check it rather than take it on trust. */
  detail: string;
}

/**
 * Series types the platform defines that this connector refuses to map, with the
 * reason. Refusal is a mapping decision and belongs in code, not only in prose: the
 * mapper reports these as `OperationOutcome` issues so a caller learns that data
 * was dropped and why, instead of finding a shorter bundle than expected.
 */
export const UNRESOLVED_SERIES: Readonly<Record<string, Refusal>> = {
  blood_alcohol_content: {
    reason: 'unit-conflict',
    detail: 'Declared mg_dl in series_types.py; example payload sends g/dL. A factor of 1000 apart.'
  },
  walking_step_length: {
    reason: 'unit-conflict',
    detail: 'Declared cm; example payload sends 0.72 m. 0.72 cm is not a step length.'
  },
  running_stride_length: {
    reason: 'unit-conflict',
    detail: 'Declared cm; example payload sends 1.24 m. 1.24 cm is not a stride.'
  },
  physical_effort: {
    reason: 'unit-conflict',
    detail: 'Declared score; example payload sends MET·min. A score and an energy-time product are not the same axis.'
  },
  stair_ascent_speed: {
    reason: 'unit-conflict',
    detail: 'Declared m_per_s; example payload sends floors/min.'
  },
  stair_descent_speed: {
    reason: 'unit-conflict',
    detail: 'Declared m_per_s; example payload sends floors/min.'
  },
  peripheral_perfusion_index: {
    reason: 'unit-conflict',
    detail: 'Declared score; example payload sends %.'
  },
  garmin_body_battery: {
    reason: 'unit-conflict',
    detail: 'Declared percent; example payload sends score. Both are 0-100, which is what makes the confusion durable.'
  },
  atrial_fibrillation_burden: {
    reason: 'unit-conflict',
    detail: 'Declared count; example payload sends %.'
  },
  electrodermal_activity: {
    reason: 'unit-conflict',
    detail: 'Declared count; example payload sends S (siemens).'
  },
  insulin_delivery: {
    reason: 'unit-conflict',
    detail: 'Declared count; example payload sends IU. Refusing an insulin dose is the only safe reading of that.'
  },
  uv_exposure: {
    reason: 'unit-conflict',
    detail: 'Declared count; example payload sends J/m².'
  },
  nike_fuel: {
    reason: 'unit-conflict',
    detail: 'Declared count; example payload sends NikeFuel, a proprietary index with no UCUM expression.'
  },
  sleeping_breathing_disturbances: {
    reason: 'unit-conflict',
    detail: 'Declared count; example payload sends count/h. A count and a rate are different quantities.'
  },
  breathing_disturbance_index: {
    reason: 'unit-conflict',
    detail: 'Declared score; example payload sends count/h.'
  },
  garmin_skin_temperature: {
    reason: 'unit-conflict',
    detail:
      'The enum comment calls it a deviation from baseline; the example payload is an absolute 35.8 °C. Deviation and absolute need different UCUM codes (K vs Cel).'
  },
  blood_pressure_systolic: {
    reason: 'no-ucum-code',
    detail: 'Both sources agree on mmHg. @open-twin/fhir-core has no mm[Hg] entry and this package may not add one.'
  },
  blood_pressure_diastolic: {
    reason: 'no-ucum-code',
    detail: 'Both sources agree on mmHg. @open-twin/fhir-core has no mm[Hg] entry and this package may not add one.'
  },
  blood_glucose: {
    reason: 'no-ucum-code',
    detail:
      'Both sources agree on mg/dL. No mg/dL entry in @open-twin/fhir-core, and DECISIONS.md records that the LOINC code for mass vs substance concentration is itself unresolved.'
  },
  body_mass_index: {
    reason: 'no-ucum-code',
    detail: 'Both sources agree on kg/m². No kg/m2 entry in @open-twin/fhir-core.'
  },
  power: { reason: 'no-ucum-code', detail: 'watts. No W entry in @open-twin/fhir-core.' },
  running_power: { reason: 'no-ucum-code', detail: 'watts. No W entry in @open-twin/fhir-core.' },
  cadence: {
    reason: 'no-ucum-code',
    detail:
      'rpm. No entry in @open-twin/fhir-core, and "revolutions per minute" for a running cadence is really steps per minute — the denominator is agreed, the numerator is not.'
  },
  forced_vital_capacity: { reason: 'no-ucum-code', detail: 'liters. No L entry in @open-twin/fhir-core.' },
  forced_expiratory_volume_1: { reason: 'no-ucum-code', detail: 'liters. No L entry in @open-twin/fhir-core.' },
  peak_expiratory_flow_rate: { reason: 'no-ucum-code', detail: 'L/min. No entry in @open-twin/fhir-core.' },
  hydration: { reason: 'no-ucum-code', detail: 'mL. No mL entry in @open-twin/fhir-core.' },
  environmental_audio_exposure: {
    reason: 'no-ucum-code',
    detail: 'Declared dB; example payload sends dBASPL. No dB entry in @open-twin/fhir-core either.'
  },
  headphone_audio_exposure: {
    reason: 'no-ucum-code',
    detail: 'Declared dB; example payload sends dBASPL. No dB entry in @open-twin/fhir-core either.'
  },
  environmental_sound_reduction: { reason: 'no-ucum-code', detail: 'dB. No dB entry in @open-twin/fhir-core.' },
  weather_temperature: {
    reason: 'not-a-patient-observation',
    detail:
      'Ambient weather, not a property of the subject. It belongs on the encounter context, not on an Observation about the patient.'
  },
  weather_humidity: { reason: 'not-a-patient-observation', detail: 'Ambient weather, not a property of the subject.' },
  air_temperature: { reason: 'not-a-patient-observation', detail: 'Ambient air, not a property of the subject.' },
  water_temperature: { reason: 'not-a-patient-observation', detail: 'Ambient water, not a property of the subject.' },
  latitude: {
    reason: 'not-a-patient-observation',
    detail: 'Position. Publishing it as a patient Observation would put a location trace in a clinical record.'
  },
  longitude: {
    reason: 'not-a-patient-observation',
    detail: 'Position. Publishing it as a patient Observation would put a location trace in a clinical record.'
  },
  elevation: { reason: 'not-a-patient-observation', detail: 'Position. Part of a location trace.' },
  running_vertical_ratio: {
    reason: 'single-source',
    detail:
      'Declared percent in series_types.py and mentioned nowhere else — no example payload, no docs table entry. One source is not a contract.'
  },
  running_stance_time_balance: {
    reason: 'single-source',
    detail:
      'Declared percent in series_types.py and mentioned nowhere else. A left/right balance percentage also needs a side, which the sample carries nowhere.'
  },
  inhaler_usage: {
    reason: 'wrong-fhir-element',
    detail:
      'Both sources agree on count, but a count of inhaler doses is a medication administration, not an observation about the body. MedicationAdministration is the right resource and this connector does not build one.'
  },
  number_of_alcoholic_beverages: {
    reason: 'wrong-fhir-element',
    detail:
      'Both sources agree on count. The correct FHIR category is social-history, which the shared CATEGORY table in @open-twin/fhir-core does not offer; filing substance use under survey or activity misfiles it more damagingly than omitting it.'
  }
};

/**
 * Every member of the platform's `SeriesType` enum, transcribed from
 * backend/app/schemas/enums/series_types.py (93 members at the commit this
 * connector was written against).
 *
 * Here so that coverage is checkable rather than asserted: a test requires every
 * one of these to be either mapped or explicitly refused. Without it, "not
 * supported" and "nobody noticed" look identical from the outside.
 */
export const PLATFORM_SERIES_TYPES: readonly string[] = [
  'heart_rate',
  'resting_heart_rate',
  'heart_rate_variability_sdnn',
  'heart_rate_recovery_one_minute',
  'walking_heart_rate_average',
  'heart_rate_variability_rmssd',
  'oxygen_saturation',
  'blood_glucose',
  'blood_pressure_systolic',
  'blood_pressure_diastolic',
  'respiratory_rate',
  'sleeping_breathing_disturbances',
  'breathing_disturbance_index',
  'blood_alcohol_content',
  'peripheral_perfusion_index',
  'forced_vital_capacity',
  'forced_expiratory_volume_1',
  'peak_expiratory_flow_rate',
  'height',
  'weight',
  'body_fat_percentage',
  'body_mass_index',
  'lean_body_mass',
  'body_temperature',
  'skin_temperature',
  'skin_temperature_deviation',
  'skin_temperature_trend_deviation',
  'waist_circumference',
  'body_fat_mass',
  'skeletal_muscle_mass',
  'vo2_max',
  'six_minute_walk_test_distance',
  'cardiovascular_age',
  'steps',
  'energy',
  'basal_energy',
  'stand_time',
  'exercise_time',
  'physical_effort',
  'flights_climbed',
  'average_met',
  'active_time',
  'distance_walking_running',
  'distance_cycling',
  'distance_swimming',
  'distance_downhill_snow_sports',
  'distance_other',
  'walking_step_length',
  'walking_speed',
  'walking_double_support_percentage',
  'walking_asymmetry_percentage',
  'walking_steadiness',
  'stair_descent_speed',
  'stair_ascent_speed',
  'running_power',
  'running_speed',
  'running_vertical_oscillation',
  'running_ground_contact_time',
  'running_stride_length',
  'running_vertical_ratio',
  'running_stance_time_balance',
  'swimming_stroke_count',
  'underwater_depth',
  'cadence',
  'power',
  'speed',
  'workout_effort_score',
  'estimated_workout_effort_score',
  'environmental_audio_exposure',
  'headphone_audio_exposure',
  'environmental_sound_reduction',
  'time_in_daylight',
  'water_temperature',
  'uv_exposure',
  'inhaler_usage',
  'weather_temperature',
  'weather_humidity',
  'elevation',
  'latitude',
  'longitude',
  'air_temperature',
  'garmin_stress_level',
  'garmin_skin_temperature',
  'garmin_fitness_age',
  'garmin_body_battery',
  'electrodermal_activity',
  'push_count',
  'atrial_fibrillation_burden',
  'insulin_delivery',
  'number_of_times_fallen',
  'number_of_alcoholic_beverages',
  'nike_fuel',
  'hydration'
];
