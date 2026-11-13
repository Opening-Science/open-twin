/**
 * WHAT: Declares every Observation and component the Oura mappers emit, keyed to shared or Oura-owned measurement definitions.
 * NOT:  Maps nothing and converts no unit; the mappers in ./mappers emit the values, and the audit in @open-twin/fhir-core checks them against this set.
 * GOVERNED BY: DECISIONS.md#d18
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: The sleep and session mean heart rates both carry LOINC 8867-4 next to an Oura coding, as does the heart-rate reading itself, so the means are declared by their Oura codings. `oura:hrv-balance` and the other readiness, activity and resilience contributors are 0-100 contributor scores, never the physiological quantity they are named after.
 */
import {
  declareMeasurement,
  LOINC_CODINGS,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementContext,
  type MeasurementDeclaration,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  type MeasurementValueType,
  type SharedMeasurementKey,
  UCUM
} from '@open-twin/fhir-core';
import { CONNECTOR, LOINC, OURA_UNITS, ouraCoding } from './mappers/shared';

type Coding = { system: string; code: string };

const SLEEP_PERIOD = { scope: 'sleep-period' } as const;
const SLEEP_TOTAL = { scope: 'sleep-period', statistic: 'total' } as const;
const SLEEP_MEAN = { scope: 'sleep-period', statistic: 'mean' } as const;
const DAILY = { scope: 'daily' } as const;
const DAILY_TOTAL = { scope: 'daily', statistic: 'total' } as const;
const DAILY_MEAN = { scope: 'daily', statistic: 'mean' } as const;
const SESSION = { scope: 'session' } as const;
const SESSION_TOTAL = { scope: 'session', statistic: 'total' } as const;
const SESSION_MEAN = { scope: 'session', statistic: 'mean' } as const;
const RECORD = { scope: 'record' } as const;

function define(
  name: string,
  description: string,
  valueType: MeasurementValueType,
  context: MeasurementContext,
  unit?: { code: string }
): MeasurementDefinition {
  return {
    key: `${CONNECTOR.connector}:${name}`,
    description,
    valueType,
    ...(unit ? { canonicalUnit: unit.code } : {}),
    context
  };
}

interface Entry {
  measurement: MeasurementDefinition | SharedMeasurementKey;
  coding: Coding;
  parent?: Coding;
}

/** Components of one parent Observation, declared under that parent's coding. */
function under(parent: Coding, entries: [MeasurementDefinition | SharedMeasurementKey, Coding][]): Entry[] {
  return entries.map(([measurement, coding]) => ({ measurement, coding, parent }));
}

// --- sleep (mapOuraSleepToFHIR) -------------------------------------------------

const SLEEP_PARENT = ouraCoding('sleep-score');

const SLEEP_ENTRIES: Entry[] = [
  {
    measurement: define(
      'sleep-score',
      'Oura Sleep Score for one sleep period: a vendor-computed 0-100 score, not a clinical measure. Often absent on sleep periods, in which case the Observation carries dataAbsentReason and only groups the period components.',
      'quantity',
      SLEEP_PERIOD,
      UCUM.SCORE
    ),
    coding: SLEEP_PARENT
  },
  ...under(SLEEP_PARENT, [
    ['total-sleep-time', LOINC.SLEEP_DURATION],
    ['rem-sleep-duration', LOINC.REM_SLEEP_DURATION],
    ['deep-sleep-duration', LOINC.DEEP_SLEEP_DURATION],
    ['light-sleep-duration', LOINC.LIGHT_SLEEP_DURATION],
    ['sleep-latency', LOINC.SLEEP_LATENCY],
    ['time-in-bed', LOINC_CODINGS.TIME_IN_BED],
    [
      define(
        'sleep.awake-time',
        'Time awake within one sleep period, between going to bed and getting up, as Oura reports it.',
        'quantity',
        SLEEP_TOTAL,
        UCUM.MINUTE
      ),
      ouraCoding('awake-time')
    ],
    [
      define(
        'sleep.efficiency',
        "Oura's 1-100 sleep efficiency rating for one sleep period, emitted as a percentage. Oura does not publish the formula.",
        'quantity',
        SLEEP_PERIOD,
        UCUM.PERCENT
      ),
      ouraCoding('sleep-efficiency-percentage')
    ],
    ['sleep-minimum-heart-rate', LOINC.HEART_RATE_MINIMUM],
    ['sleep-mean-heart-rate', ouraCoding('sleep-average-heart-rate')],
    ['sleep-mean-respiratory-rate', ouraCoding('sleep-average-breath')],
    [
      define(
        'sleep.average-hrv',
        'Mean heart rate variability over one sleep period as Oura computes it, in milliseconds. Not a contributor score.',
        'quantity',
        SLEEP_MEAN,
        UCUM.MILLISECOND
      ),
      ouraCoding('sleep-average-hrv')
    ],
    [
      define(
        'sleep.restless-periods',
        'Number of restless periods Oura detected within one sleep period.',
        'quantity',
        SLEEP_TOTAL,
        UCUM.COUNT
      ),
      ouraCoding('restless-periods')
    ],
    [
      define(
        'sleep.sleep-score-delta',
        "The change one sleep period made to Oura's Sleep Score. A score difference, not a score.",
        'quantity',
        SLEEP_PERIOD,
        UCUM.SCORE
      ),
      ouraCoding('sleep-score-delta')
    ],
    [
      define(
        'sleep.readiness-score-delta',
        "The change one sleep period made to Oura's Readiness Score. A score difference, not a score.",
        'quantity',
        SLEEP_PERIOD,
        UCUM.SCORE
      ),
      ouraCoding('readiness-score-delta')
    ],
    [
      define(
        'sleep.temperature-deviation',
        "Deviation of skin temperature during one sleep period from the wearer's personal baseline, as a temperature difference. Never an absolute body temperature.",
        'quantity',
        SLEEP_PERIOD,
        UCUM.KELVIN
      ),
      ouraCoding('temperature-deviation')
    ],
    [
      define(
        'sleep.temperature-trend-deviation',
        "Deviation of the wearer's skin-temperature trend from their baseline, as Oura reports it with one sleep period. A temperature difference, never an absolute body temperature.",
        'quantity',
        SLEEP_PERIOD,
        UCUM.KELVIN
      ),
      ouraCoding('temperature-trend-deviation')
    ]
  ])
];

// --- daily activity (mapOuraDailyActivityToFHIR) --------------------------------

const ACTIVITY_PARENT = ouraCoding('activity-score');

function activityContributor(code: string, display: string): [MeasurementDefinition, Coding] {
  return [
    define(
      `activity.contributor.${code}`,
      `Oura Activity Score contributor "${display}" for one day: a vendor-computed 1-100 contributor score, not a measurement of what it is named after.`,
      'quantity',
      DAILY,
      UCUM.SCORE
    ),
    ouraCoding(code)
  ];
}

function activityTotal(
  code: string,
  description: string,
  unit: { code: string },
  context: MeasurementContext = DAILY_TOTAL
): [MeasurementDefinition, Coding] {
  return [define(`activity.${code}`, description, 'quantity', context, unit), ouraCoding(code)];
}

const ACTIVITY_ENTRIES: Entry[] = [
  {
    measurement: define(
      'activity-score',
      'Oura Activity Score for one day: a vendor-computed 0-100 score, not a clinical measure.',
      'quantity',
      DAILY,
      UCUM.SCORE
    ),
    coding: ACTIVITY_PARENT
  },
  ...under(ACTIVITY_PARENT, [
    ['daily-energy-expenditure', LOINC.CALORIES_BURNED_24H],
    activityTotal(
      'active-calories',
      'Energy expended through activity over one day, excluding basal expenditure. Not the daily total energy expenditure.',
      UCUM.KILOCALORIE
    ),
    activityTotal(
      'target-calories',
      "Oura's active-energy target for one day. A goal, not a measurement.",
      UCUM.KILOCALORIE,
      DAILY
    ),
    ['daily-step-count', LOINC.STEPS_24H],
    activityContributor('meet-daily-targets', 'Meet Daily Targets'),
    activityContributor('move-every-hour', 'Move Every Hour'),
    activityContributor('recovery-time', 'Recovery Time'),
    activityContributor('stay-active', 'Stay Active'),
    activityContributor('training-frequency', 'Training Frequency'),
    activityContributor('training-volume', 'Training Volume'),
    [
      define(
        'activity.average-met',
        "Mean metabolic equivalent over one day, from Oura's average_met_minutes field.",
        'quantity',
        DAILY_MEAN,
        UCUM.MET
      ),
      ouraCoding('average-met')
    ],
    activityTotal(
      'high-activity-met-minutes',
      'MET-minutes accumulated in high-intensity activity over one day.',
      UCUM.MET_MINUTES
    ),
    activityTotal(
      'medium-activity-met-minutes',
      'MET-minutes accumulated in medium-intensity activity over one day.',
      UCUM.MET_MINUTES
    ),
    activityTotal(
      'low-activity-met-minutes',
      'MET-minutes accumulated in low-intensity activity over one day.',
      UCUM.MET_MINUTES
    ),
    activityTotal('sedentary-met-minutes', 'MET-minutes accumulated while sedentary over one day.', UCUM.MET_MINUTES),
    activityTotal('high-activity-time', 'Time in high-intensity activity over one day.', UCUM.MINUTE),
    activityTotal('medium-activity-time', 'Time in medium-intensity activity over one day.', UCUM.MINUTE),
    activityTotal('low-activity-time', 'Time in low-intensity activity over one day.', UCUM.MINUTE),
    activityTotal('sedentary-time', 'Time sedentary over one day.', UCUM.MINUTE),
    activityTotal('resting-time', 'Time resting over one day, as Oura classifies it.', UCUM.MINUTE),
    activityTotal('non-wear-time', 'Time the ring was not worn over one day.', UCUM.MINUTE),
    activityTotal(
      'equivalent-walking-distance',
      'Walking distance equivalent to the activity Oura measured over one day. An estimate, not a distance travelled.',
      UCUM.METRE
    ),
    activityTotal(
      'meters-to-target',
      "Equivalent walking distance still needed on one day to reach Oura's activity target.",
      UCUM.METRE,
      DAILY
    ),
    activityTotal(
      'target-meters',
      "Oura's equivalent-walking-distance target for one day. A goal, not a measurement.",
      UCUM.METRE,
      DAILY
    ),
    activityTotal('inactivity-alerts', 'Number of inactivity alerts Oura raised over one day.', UCUM.COUNT)
  ])
];

// --- readiness (mapOuraReadinessToFHIR) -----------------------------------------

const READINESS_PARENT = ouraCoding('readiness-score');

function readinessContributor(code: string, display: string): [MeasurementDefinition, Coding] {
  return [
    define(
      `readiness.contributor.${code}`,
      `Oura Readiness Score contributor "${display}" for one day: a vendor-computed 1-100 contributor score, not a measurement of what it is named after.`,
      'quantity',
      DAILY,
      UCUM.SCORE
    ),
    ouraCoding(code)
  ];
}

const READINESS_ENTRIES: Entry[] = [
  {
    measurement: define(
      'readiness-score',
      'Oura Readiness Score for one day: a vendor-computed 0-100 score, not a clinical measure.',
      'quantity',
      DAILY,
      UCUM.SCORE
    ),
    coding: READINESS_PARENT
  },
  ...under(READINESS_PARENT, [
    readinessContributor('activity-balance', 'Activity Balance'),
    // A 0-100 contributor score. Not heart rate variability in milliseconds.
    readinessContributor('hrv-balance', 'HRV Balance'),
    readinessContributor('previous-day-activity', 'Previous Day Activity'),
    readinessContributor('previous-night', 'Previous Night'),
    readinessContributor('recovery-index', 'Recovery Index'),
    // A 0-100 contributor score. Not a resting heart rate.
    readinessContributor('resting-heart-rate', 'Resting Heart Rate'),
    readinessContributor('sleep-balance', 'Sleep Balance'),
    readinessContributor('sleep-regularity', 'Sleep Regularity'),
    [
      define(
        'readiness.temperature-deviation',
        "Deviation of skin temperature from the wearer's personal baseline, as reported with one day's Readiness. A temperature difference, never an absolute body temperature.",
        'quantity',
        DAILY,
        UCUM.KELVIN
      ),
      ouraCoding('temperature-deviation')
    ],
    [
      define(
        'readiness.temperature-trend-deviation',
        "Deviation of the wearer's skin-temperature trend from their baseline, as reported with one day's Readiness. A temperature difference, never an absolute body temperature.",
        'quantity',
        DAILY,
        UCUM.KELVIN
      ),
      ouraCoding('temperature-trend-deviation')
    ]
  ])
];

// --- resilience (mapOuraResilienceToFHIR) ---------------------------------------

const RESILIENCE_PARENT = ouraCoding('resilience-level');

function resilienceContributor(code: string, display: string): [MeasurementDefinition, Coding] {
  return [
    define(
      `resilience.contributor.${code}`,
      `Oura Resilience contributor "${display}" for one day: a vendor-computed 0-100 contributor score, not a measurement of what it is named after.`,
      'quantity',
      DAILY,
      UCUM.SCORE
    ),
    ouraCoding(code)
  ];
}

const RESILIENCE_ENTRIES: Entry[] = [
  {
    // The value is an Oura code from the closed `level` enum, not the coding declared here.
    measurement: define(
      'resilience-level',
      'Oura Resilience level for one day: a vendor category from a closed five-term value set, as a CodeableConcept.',
      'codeable-concept',
      DAILY
    ),
    coding: RESILIENCE_PARENT
  },
  ...under(RESILIENCE_PARENT, [
    resilienceContributor('sleep-recovery', 'Sleep Recovery'),
    resilienceContributor('daytime-recovery', 'Daytime Recovery'),
    resilienceContributor('stress', 'Stress')
  ])
];

// --- stress (mapOuraStressToFHIR) -----------------------------------------------

const STRESS_PARENT = ouraCoding('daily-stress');

const STRESS_ENTRIES: Entry[] = [
  {
    // The value is an Oura code from the closed `day_summary` enum.
    measurement: define(
      'daily-stress-summary',
      "Oura's stress summary category for one day, from a closed value set, as a CodeableConcept.",
      'codeable-concept',
      DAILY
    ),
    coding: STRESS_PARENT
  },
  ...under(STRESS_PARENT, [
    [
      define(
        'stress.stress-high',
        'Time Oura classified as high stress over one day.',
        'quantity',
        DAILY_TOTAL,
        UCUM.MINUTE
      ),
      ouraCoding('stress-high')
    ],
    [
      define(
        'stress.recovery-high',
        'Time Oura classified as high recovery over one day.',
        'quantity',
        DAILY_TOTAL,
        UCUM.MINUTE
      ),
      ouraCoding('recovery-high')
    ]
  ])
];

// --- SpO2 (mapOuraSpo2ToFHIR) ---------------------------------------------------

const SPO2_PARENT = ouraCoding('spo2-daily-summary');

const SPO2_ENTRIES: Entry[] = [
  {
    measurement: define(
      'spo2-daily-summary',
      "Value-less panel grouping Oura's daily blood oxygen measurements; the values are its components.",
      'none',
      DAILY
    ),
    coding: SPO2_PARENT
  },
  ...under(SPO2_PARENT, [
    [
      // Carries LOINC 59408-5 too, which is a single reading; the Oura coding names the statistic.
      define(
        'spo2.daily-average',
        'Mean peripheral oxygen saturation Oura reports for one day, averaged over the sleep it measures. A summary, not one pulse-oximetry reading.',
        'quantity',
        DAILY_MEAN,
        UCUM.PERCENT
      ),
      ouraCoding('spo2-daily-average')
    ],
    [
      define(
        'spo2.breathing-disturbance-index',
        "Oura's breathing disturbance index for one day: breathing disturbances per hour, as Oura computes it. Not a clinical apnoea-hypopnoea index.",
        'quantity',
        DAILY,
        OURA_UNITS.PER_HOUR
      ),
      ouraCoding('breathing-disturbance-index')
    ]
  ])
];

// --- heart rate (mapOuraHeartRateToFHIR) ----------------------------------------

const HEART_RATE_ENTRIES: Entry[] = [{ measurement: 'heart-rate', coding: LOINC_CODINGS.HEART_RATE }];

// --- session (mapOuraSessionToFHIR) ---------------------------------------------

const SESSION_PARENT = ouraCoding('session');

const SESSION_ENTRIES: Entry[] = [
  {
    measurement: define(
      'session',
      'Value-less panel for one Oura session (meditation, breathing, nap, relaxation, rest or body status); the values are its components.',
      'none',
      SESSION
    ),
    coding: SESSION_PARENT
  },
  ...under(SESSION_PARENT, [
    [
      // Carries LOINC 8867-4 too; the Oura coding names the statistic.
      define(
        'session.mean-heart-rate',
        'Arithmetic mean of the heart rate samples Oura recorded during one session. Not one heart rate reading.',
        'quantity',
        SESSION_MEAN,
        UCUM.PER_MINUTE
      ),
      ouraCoding('session-mean-heart-rate')
    ],
    [
      define(
        'session.mean-heart-rate-variability',
        'Arithmetic mean of the heart rate variability samples Oura recorded during one session, in milliseconds.',
        'quantity',
        SESSION_MEAN,
        UCUM.MILLISECOND
      ),
      ouraCoding('session-mean-heart-rate-variability')
    ],
    [
      define(
        'session.mean-motion-count',
        'Arithmetic mean of the motion-count samples Oura recorded during one session.',
        'quantity',
        SESSION_MEAN,
        UCUM.COUNT
      ),
      ouraCoding('session-mean-motion-count')
    ],
    [
      // The value is an Oura code from the closed `mood` enum.
      define(
        'session.mood',
        'Mood the wearer reported for one session, from a closed value set, as a CodeableConcept.',
        'codeable-concept',
        SESSION
      ),
      ouraCoding('session-mood')
    ]
  ])
];

// --- workout (mapOuraWorkoutToFHIR) ---------------------------------------------

const WORKOUT_PARENT = ouraCoding('workout');

const WORKOUT_ENTRIES: Entry[] = [
  {
    measurement: define(
      'workout',
      'Value-less panel for one Oura workout; the activity is its code text and the values are its components.',
      'none',
      SESSION
    ),
    coding: WORKOUT_PARENT
  },
  ...under(WORKOUT_PARENT, [
    ['session-energy-expenditure', LOINC.CALORIES_BURNED],
    [
      define('workout.distance', 'Distance covered during one workout.', 'quantity', SESSION_TOTAL, UCUM.METRE),
      ouraCoding('workout-distance')
    ]
  ])
];

// --- VO2 max (mapOuraVO2MaxToFHIR) ----------------------------------------------

const VO2_MAX_ENTRIES: Entry[] = [{ measurement: 'vo2max', coding: LOINC.VO2_MAX }];

// --- cardiovascular age (mapOuraCardiovascularAgeToFHIR) ------------------------

const VASCULAR_AGE_PARENT = ouraCoding('vascular-age');

const CARDIOVASCULAR_ENTRIES: Entry[] = [
  {
    measurement: define(
      'vascular-age',
      "Oura's estimate of vascular age for one day, in years. A model output, not the wearer's chronological age.",
      'quantity',
      DAILY,
      UCUM.YEAR
    ),
    coding: VASCULAR_AGE_PARENT
  },
  ...under(VASCULAR_AGE_PARENT, [
    [
      // Not the shared `pulse-wave-velocity`, which is one reading: Oura reports one value per day.
      define(
        'cardiovascular.pulse-wave-velocity',
        'Pulse wave velocity Oura reports for one day alongside its vascular-age estimate. A daily value, not one reading.',
        'quantity',
        DAILY,
        UCUM.METRE_PER_SECOND
      ),
      LOINC.PULSE_WAVE_VELOCITY
    ]
  ])
];

// --- personal info (mapOuraPersonalToFHIR) --------------------------------------

// Not the shared `body-weight` / `body-height`, which are measurements: these are
// profile settings with no measurement time, and the Observation's effectiveDateTime
// is when the profile was retrieved. Shared, they would read as a fresh measurement.
const PERSONAL_ENTRIES: Entry[] = [
  {
    measurement: define(
      'profile.body-weight',
      "Body weight as entered in the wearer's Oura profile. A profile setting with no measurement time, not a weighing.",
      'quantity',
      RECORD,
      UCUM.KILOGRAM
    ),
    coding: LOINC.BODY_WEIGHT
  },
  {
    measurement: define(
      'profile.body-height',
      "Body height as entered in the wearer's Oura profile. A profile setting with no measurement time, not a measurement.",
      'quantity',
      RECORD,
      UCUM.CENTIMETRE
    ),
    coding: LOINC.BODY_HEIGHT
  }
];

// --- rest mode (mapOuraRestModeToFHIR) ------------------------------------------

const REST_MODE_ENTRIES: Entry[] = [
  {
    // No scope fits a multi-day episode exactly; `interval` is the period the Observation covers.
    measurement: define(
      'rest-mode',
      'Value-less marker of one period the wearer had Oura Rest Mode switched on. Not a measurement.',
      'none',
      { scope: 'interval' }
    ),
    coding: ouraCoding('rest-mode')
  }
];

// --- ring configuration (mapOuraRingConfigToFHIR) -------------------------------

const RING_CONFIGURATION_PARENT = ouraCoding('ring-configuration');

const RING_CONFIGURATION_ENTRIES: Entry[] = [
  {
    measurement: define(
      'ring-configuration',
      'Value-less record describing one configured Oura ring; the hardware is a Device and the size is its component.',
      'none',
      RECORD
    ),
    coding: RING_CONFIGURATION_PARENT
  },
  ...under(RING_CONFIGURATION_PARENT, [
    [
      define(
        'ring-configuration.ring-size',
        'US ring size of one configured Oura ring. An ordinal label, not a length.',
        'quantity',
        RECORD,
        OURA_UNITS.RING_SIZE
      ),
      ouraCoding('ring-size')
    ]
  ])
];

const ENTRIES: Entry[] = [
  ...SLEEP_ENTRIES,
  ...ACTIVITY_ENTRIES,
  ...READINESS_ENTRIES,
  ...RESILIENCE_ENTRIES,
  ...STRESS_ENTRIES,
  ...SPO2_ENTRIES,
  ...HEART_RATE_ENTRIES,
  ...SESSION_ENTRIES,
  ...WORKOUT_ENTRIES,
  ...VO2_MAX_ENTRIES,
  ...CARDIOVASCULAR_ENTRIES,
  ...PERSONAL_ENTRIES,
  ...REST_MODE_ENTRIES,
  ...RING_CONFIGURATION_ENTRIES
];

const declarations: MeasurementDeclaration[] = ENTRIES.map(({ measurement, coding, parent }) =>
  declareMeasurement(measurement, coding, parent)
);

const definitions: MeasurementDefinition[] = ENTRIES.flatMap(({ measurement }) =>
  typeof measurement === 'string' ? [] : [measurement]
);

/** Every Observation and component the Oura connector emits. */
export const OURA_MEASUREMENTS: MeasurementDeclarationSet = {
  schemaVersion: MEASUREMENT_SCHEMA_VERSION,
  connector: CONNECTOR.connector,
  version: 1,
  coverage: 'complete',
  definitions,
  declarations
};
