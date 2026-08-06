/**
 * WHAT: One committed fixture + assertions per Anchor marker class.
 * NOT:  Does not assert population selection; intervals are those supplied on the fixture.
 * GOVERNED BY: packages/anchor-layer/data/anchor-layer.v1.json
 * CORRECTNESS: Round-trip / fixture tests for bundle shape; HL7 validator not yet run locally (no JRE) — external authority gap, not an oversight.
 */
import { SYSTEMS } from '@open-twin/fhir-core';
import type { Device, Observation, Patient, Resource } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { COLLECTION_CONTEXT_EXTENSION, EXT_CYCLE_PHASE, EXT_TOD_WINDOW } from '../context.js';
import { ALL_MARKER_CLASS_FIXTURES, type MarkerClassId } from '../fixtures/markerClasses.js';
import { bundleFromMarkerClassFixture } from '../verification/exampleBundles.js';

function isObservation(resource: Resource | undefined): resource is Observation {
  return resource?.resourceType === 'Observation';
}

function isPatient(resource: Resource | undefined): resource is Patient {
  return resource?.resourceType === 'Patient';
}

function isDevice(resource: Resource | undefined): resource is Device {
  return resource?.resourceType === 'Device';
}

/** Independently derived expectations (catalogue / LOINC_UNITS), not fixture echo. */
const EXPECTED: Record<MarkerClassId, { loinc: string; unit: string; hasReferenceRange: boolean }> = {
  mass_concentration: { loinc: '2276-4', unit: 'ng/mL', hasReferenceRange: true },
  molar_concentration: { loinc: '2000-8', unit: 'mmol/L', hasReferenceRange: true },
  enzymatic_activity: { loinc: '1742-6', unit: 'U/L', hasReferenceRange: true },
  ratio_percent: { loinc: '4548-4', unit: '%', hasReferenceRange: true },
  cell_count: { loinc: '6690-2', unit: '10*9/L', hasReferenceRange: false },
  stool_mass_mass: { loinc: '38445-3', unit: 'ug/g', hasReferenceRange: true },
  creatinine_normalised: { loinc: '25095-1', unit: 'nmol/mmol', hasReferenceRange: false },
  cycle_phase_dependent: { loinc: '14715-7', unit: 'pmol/L', hasReferenceRange: true },
  arbitrary_iu: { loinc: '3016-3', unit: 'm[IU]/L', hasReferenceRange: true }
};

describe('marker-class fixtures', () => {
  it('registers exactly the nine assigned classes', () => {
    expect(ALL_MARKER_CLASS_FIXTURES.map((f) => f.classId).sort()).toEqual(
      [
        'arbitrary_iu',
        'cell_count',
        'creatinine_normalised',
        'cycle_phase_dependent',
        'enzymatic_activity',
        'mass_concentration',
        'molar_concentration',
        'ratio_percent',
        'stool_mass_mass'
      ].sort()
    );
  });

  it.each(ALL_MARKER_CLASS_FIXTURES)('$label emits LOINC + UCUM Observation with collection context', (fixture) => {
    const expected = EXPECTED[fixture.classId];
    const bundle = bundleFromMarkerClassFixture(fixture);
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');

    const patient = bundle.entry?.find((e) => isPatient(e.resource))?.resource;
    expect(isPatient(patient)).toBe(true);
    if (!isPatient(patient)) throw new Error('missing Patient');
    expect(patient).toMatchObject({
      resourceType: 'Patient',
      gender: fixture.context.sex,
      birthDate: fixture.context.birthDate
    });

    const device = bundle.entry?.find((e) => isDevice(e.resource))?.resource;
    expect(isDevice(device)).toBe(true);

    const obs = bundle.entry?.find((e) => isObservation(e.resource))?.resource;
    expect(isObservation(obs)).toBe(true);
    if (!isObservation(obs)) throw new Error('missing Observation');

    expect(obs.code?.coding?.[0]).toMatchObject({
      system: SYSTEMS.LOINC,
      code: expected.loinc
    });
    expect(obs.valueQuantity).toMatchObject({
      system: SYSTEMS.UCUM,
      code: expected.unit
    });
    expect(obs.subject?.reference).toBe(`urn:uuid:${patient.id}`);
    expect(obs.effectiveDateTime).toBe(fixture.context.effectiveDateTime);
    expect(obs.device?.reference).toMatch(/^urn:uuid:/);
    expect(obs.category?.[0]?.coding?.[0]?.code).toBe('laboratory');

    if (expected.hasReferenceRange) {
      expect(obs.referenceRange?.length).toBeGreaterThanOrEqual(1);
      expect(obs.referenceRange?.[0]?.appliesTo?.[0]?.text).toBeTruthy();
    } else {
      expect(obs.referenceRange).toBeUndefined();
    }
  });

  it('cycle-phase fixture carries menstrual phase to the interpreter', () => {
    const fixture = ALL_MARKER_CLASS_FIXTURES.find((f) => f.classId === 'cycle_phase_dependent');
    if (!fixture) throw new Error('missing cycle_phase_dependent fixture');
    const bundle = bundleFromMarkerClassFixture(fixture);
    const obs = bundle.entry?.find((e) => isObservation(e.resource))?.resource;
    if (!isObservation(obs)) throw new Error('missing Observation');
    const ctxExt = obs.extension?.find((e) => e.url === COLLECTION_CONTEXT_EXTENSION);
    expect(ctxExt?.extension?.some((e) => e.url === EXT_CYCLE_PHASE && e.valueCode === 'follicular')).toBe(true);
    expect(obs.referenceRange?.[0]?.appliesTo?.[0]?.text).toBe('female_Follikelphase');
    expect(obs.code?.coding?.[0]?.display).toBe('Estradiol (E2) [Moles/volume] in Serum or Plasma');
  });

  it('IU fixture carries time-of-day window for cortisol-class questions', () => {
    const fixture = ALL_MARKER_CLASS_FIXTURES.find((f) => f.classId === 'arbitrary_iu');
    if (!fixture) throw new Error('missing arbitrary_iu fixture');
    const bundle = bundleFromMarkerClassFixture(fixture);
    const obs = bundle.entry?.find((e) => isObservation(e.resource))?.resource;
    if (!isObservation(obs)) throw new Error('missing Observation');
    const ctxExt = obs.extension?.find((e) => e.url === COLLECTION_CONTEXT_EXTENSION);
    expect(ctxExt?.extension?.some((e) => e.url === EXT_TOD_WINDOW && e.valueCode === 'vor_10h')).toBe(true);
  });
});
