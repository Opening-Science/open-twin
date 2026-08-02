/**
 * WHAT: Committed worked-example inputs — one per Anchor marker class.
 * NOT:  Not population-selection logic; intervals are supplied explicitly when present.
 * GOVERNED BY: packages/anchor-layer/data/anchor-layer.v1.json
 * CORRECTNESS: Anchor artefact intervals/units; LOINC review records for each code
 */
import type { CollectionContext } from '../context.js';
import type { BiomarkerMeasurement } from '../fhir/mapObservation.js';

export type MarkerClassId =
  | 'mass_concentration'
  | 'molar_concentration'
  | 'enzymatic_activity'
  | 'ratio_percent'
  | 'cell_count'
  | 'stool_mass_mass'
  | 'creatinine_normalised'
  | 'cycle_phase_dependent'
  | 'arbitrary_iu';

export interface MarkerClassFixture {
  classId: MarkerClassId;
  label: string;
  biomarker_id: string;
  context: CollectionContext;
  measurement: BiomarkerMeasurement;
  bundleTimestamp: string;
}

const BASE_DEVICE = {
  deviceKey: 'imd-potsdam',
  deviceManufacturer: 'IMD Labor Berlin-Potsdam',
  deviceModel: 'catalogue-fixture',
} as const;

/** a. mass concentration — Ferritin ng/mL, male adult interval */
export const FIXTURE_MASS_CONCENTRATION: MarkerClassFixture = {
  classId: 'mass_concentration',
  label: 'BM-107 Ferritin mass concentration',
  biomarker_id: 'BM-107',
  bundleTimestamp: '2026-07-12T10:00:00Z',
  context: {
    subjectKey: 'anchor-class-ferritin',
    sex: 'male',
    birthDate: '1985-03-14',
    effectiveDateTime: '2026-07-12T09:15:00+02:00',
    collectionEventId: 'draw-ferritin-2026-07-12',
    fasting: true,
    ...BASE_DEVICE,
  },
  measurement: {
    biomarker_id: 'BM-107',
    value: 120,
    unit_ucum: 'ng/mL',
    reference_interval_id: 'RI-044',
  },
};

/** b. molar concentration — Calcium mmol/L */
export const FIXTURE_MOLAR_CONCENTRATION: MarkerClassFixture = {
  classId: 'molar_concentration',
  label: 'BM-063 Calcium molar concentration',
  biomarker_id: 'BM-063',
  bundleTimestamp: '2026-07-12T10:05:00Z',
  context: {
    subjectKey: 'anchor-class-calcium',
    sex: 'female',
    birthDate: '1990-06-01',
    effectiveDateTime: '2026-07-12T08:40:00+02:00',
    collectionEventId: 'draw-calcium-2026-07-12',
    fasting: true,
    ...BASE_DEVICE,
  },
  measurement: {
    biomarker_id: 'BM-063',
    value: 2.35,
    unit_ucum: 'mmol/L',
    reference_interval_id: 'RI-019',
  },
};

/** c. enzymatic activity — GPT U/L */
export const FIXTURE_ENZYMATIC_ACTIVITY: MarkerClassFixture = {
  classId: 'enzymatic_activity',
  label: 'BM-132 GPT enzymatic activity',
  biomarker_id: 'BM-132',
  bundleTimestamp: '2026-07-12T10:10:00Z',
  context: {
    subjectKey: 'anchor-class-gpt',
    sex: 'male',
    birthDate: '1978-11-22',
    effectiveDateTime: '2026-07-12T09:00:00+02:00',
    collectionEventId: 'draw-gpt-2026-07-12',
    fasting: false,
    ...BASE_DEVICE,
  },
  measurement: {
    biomarker_id: 'BM-132',
    value: 28,
    unit_ucum: 'U/L',
    reference_interval_id: 'RI-064',
  },
};

/** d. ratio / percent — HbA1c % (LOINC property: mass fraction) */
export const FIXTURE_RATIO_PERCENT: MarkerClassFixture = {
  classId: 'ratio_percent',
  label: 'BM-139 HbA1c percent',
  biomarker_id: 'BM-139',
  bundleTimestamp: '2026-07-12T10:15:00Z',
  context: {
    subjectKey: 'anchor-class-hba1c',
    sex: 'female',
    birthDate: '1972-01-09',
    effectiveDateTime: '2026-07-12T09:05:00+02:00',
    collectionEventId: 'draw-hba1c-2026-07-12',
    fasting: false,
    ...BASE_DEVICE,
  },
  measurement: {
    biomarker_id: 'BM-139',
    value: 5.4,
    unit_ucum: '%',
    reference_interval_id: 'RI-070',
  },
};

/**
 * e. cell count — Leukocytes 10*9/L.
 * No interval on file → reference_interval_id null (abstain, not an error).
 */
export const FIXTURE_CELL_COUNT: MarkerClassFixture = {
  classId: 'cell_count',
  label: 'BM-426 Leukozyten cell count (no interval)',
  biomarker_id: 'BM-426',
  bundleTimestamp: '2026-07-12T10:20:00Z',
  context: {
    subjectKey: 'anchor-class-leu',
    sex: 'male',
    birthDate: '1988-08-08',
    effectiveDateTime: '2026-07-12T08:55:00+02:00',
    collectionEventId: 'draw-leu-2026-07-12',
    fasting: false,
    ...BASE_DEVICE,
  },
  measurement: {
    biomarker_id: 'BM-426',
    value: 6.2,
    unit_ucum: '10*9/L',
    reference_interval_id: null,
  },
};

/** f. stool mass/mass — Calprotectin ug/g */
export const FIXTURE_STOOL_MASS_MASS: MarkerClassFixture = {
  classId: 'stool_mass_mass',
  label: 'BM-064 Calprotectin stool mass/mass',
  biomarker_id: 'BM-064',
  bundleTimestamp: '2026-07-12T10:25:00Z',
  context: {
    subjectKey: 'anchor-class-calprotectin',
    sex: 'female',
    birthDate: '1995-04-17',
    effectiveDateTime: '2026-07-11T18:00:00+02:00',
    collectionEventId: 'draw-calprotectin-2026-07-11',
    fasting: null,
    ...BASE_DEVICE,
  },
  measurement: {
    biomarker_id: 'BM-064',
    value: 32,
    unit_ucum: 'ug/g',
    reference_interval_id: 'RI-020',
  },
};

/**
 * g. creatinine-normalised — DPD nmol/mmol.
 * No interval on file → null (abstain).
 */
export const FIXTURE_CREATININE_NORMALISED: MarkerClassFixture = {
  classId: 'creatinine_normalised',
  label: 'BM-435 DPD creatinine-normalised (no interval)',
  biomarker_id: 'BM-435',
  bundleTimestamp: '2026-07-12T10:30:00Z',
  context: {
    subjectKey: 'anchor-class-dpd',
    sex: 'female',
    birthDate: '1965-12-02',
    effectiveDateTime: '2026-07-12T07:30:00+02:00',
    collectionEventId: 'draw-dpd-2026-07-12',
    fasting: true,
    ...BASE_DEVICE,
  },
  measurement: {
    biomarker_id: 'BM-435',
    value: 5.1,
    unit_ucum: 'nmol/mmol',
    reference_interval_id: null,
  },
};

/**
 * h. cycle-phase-dependent — Östradiol with follicular-phase interval.
 * Cycle phase on context reaches the interpreter; connector does not pick the population.
 */
export const FIXTURE_CYCLE_PHASE: MarkerClassFixture = {
  classId: 'cycle_phase_dependent',
  label: 'BM-001 Östradiol cycle-phase-dependent',
  biomarker_id: 'BM-001',
  bundleTimestamp: '2026-07-12T10:35:00Z',
  context: {
    subjectKey: 'anchor-class-estradiol',
    sex: 'female',
    birthDate: '1993-09-30',
    effectiveDateTime: '2026-07-12T09:20:00+02:00',
    collectionEventId: 'draw-estradiol-2026-07-12',
    menstrualCyclePhase: 'follicular',
    fasting: false,
    ...BASE_DEVICE,
  },
  measurement: {
    biomarker_id: 'BM-001',
    value: 250,
    unit_ucum: 'pmol/L',
    // Caller already chose the follicular interval — not a lookup from phase.
    reference_interval_id: 'RI-002',
  },
};

/** i. arbitrary / IU — TSH m[IU]/L */
export const FIXTURE_ARBITRARY_IU: MarkerClassFixture = {
  classId: 'arbitrary_iu',
  label: 'BM-386 TSH arbitrary IU',
  biomarker_id: 'BM-386',
  bundleTimestamp: '2026-07-12T10:40:00Z',
  context: {
    subjectKey: 'anchor-class-tsh',
    sex: 'female',
    birthDate: '1980-02-29',
    effectiveDateTime: '2026-07-12T08:10:00+02:00',
    collectionEventId: 'draw-tsh-2026-07-12',
    fasting: true,
    // TOD window carried for cortisol-class questions on the same draw pattern.
    timeOfDayWindow: 'vor_10h',
    ...BASE_DEVICE,
  },
  measurement: {
    biomarker_id: 'BM-386',
    value: 1.8,
    unit_ucum: 'm[IU]/L',
    reference_interval_id: 'RI-097',
  },
};

export const ALL_MARKER_CLASS_FIXTURES: MarkerClassFixture[] = [
  FIXTURE_MASS_CONCENTRATION,
  FIXTURE_MOLAR_CONCENTRATION,
  FIXTURE_ENZYMATIC_ACTIVITY,
  FIXTURE_RATIO_PERCENT,
  FIXTURE_CELL_COUNT,
  FIXTURE_STOOL_MASS_MASS,
  FIXTURE_CREATININE_NORMALISED,
  FIXTURE_CYCLE_PHASE,
  FIXTURE_ARBITRARY_IU,
];
