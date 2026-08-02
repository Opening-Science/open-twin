/**
 * WHAT: One committed fixture + assertions per Anchor marker class.
 * NOT:  Does not assert population selection; intervals are those supplied on the fixture.
 * GOVERNED BY: packages/anchor-layer/data/anchor-layer.v1.json
 * CORRECTNESS: Round-trip / fixture tests for bundle shape; HL7 validator not yet run locally (no JRE) — external authority gap, not an oversight.
 */
import { SYSTEMS } from '@open-twin/fhir-core';
import type { Device, Observation, Patient, Resource } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { EXT_CYCLE_PHASE, EXT_TOD_WINDOW } from '../context.js';
import { ALL_MARKER_CLASS_FIXTURES } from '../fixtures/markerClasses.js';
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
        'stool_mass_mass',
      ].sort(),
    );
  });

  it.each(ALL_MARKER_CLASS_FIXTURES)(
    '$label emits LOINC + UCUM Observation with collection context',
    (fixture) => {
      const bundle = bundleFromMarkerClassFixture(fixture);
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('collection');

      const patient = bundle.entry?.find((e) => isPatient(e.resource))?.resource;
      expect(isPatient(patient)).toBe(true);
      if (!isPatient(patient)) throw new Error('missing Patient');
      expect(patient).toMatchObject({
        resourceType: 'Patient',
        gender: fixture.context.sex,
        birthDate: fixture.context.birthDate,
      });

      const device = bundle.entry?.find((e) => isDevice(e.resource))?.resource;
      expect(isDevice(device)).toBe(true);

      const obs = bundle.entry?.find((e) => isObservation(e.resource))?.resource;
      expect(isObservation(obs)).toBe(true);
      if (!isObservation(obs)) throw new Error('missing Observation');

      expect(obs.code?.coding?.[0]).toMatchObject({ system: SYSTEMS.LOINC });
      expect(obs.valueQuantity).toMatchObject({
        value: fixture.measurement.value,
        system: SYSTEMS.UCUM,
        code: fixture.measurement.unit_ucum,
      });
      expect(obs.effectiveDateTime).toBe(fixture.context.effectiveDateTime);
      expect(obs.device?.reference).toMatch(/^urn:uuid:/);
      expect(obs.category?.[0]?.coding?.[0]?.code).toBe('laboratory');

      if (fixture.measurement.reference_interval_id == null) {
        expect(obs.referenceRange).toBeUndefined();
      } else {
        expect(obs.referenceRange?.length).toBeGreaterThanOrEqual(1);
        expect(obs.referenceRange?.[0]?.appliesTo?.[0]?.text).toBeTruthy();
      }
    },
  );

  it('cycle-phase fixture carries menstrual phase to the interpreter', () => {
    const fixture = ALL_MARKER_CLASS_FIXTURES.find((f) => f.classId === 'cycle_phase_dependent')!;
    const bundle = bundleFromMarkerClassFixture(fixture);
    const obs = bundle.entry?.find((e) => isObservation(e.resource))?.resource;
    if (!isObservation(obs)) throw new Error('missing Observation');
    expect(obs.extension?.some((e) => e.url === EXT_CYCLE_PHASE && e.valueCode === 'follicular')).toBe(
      true,
    );
    expect(obs.referenceRange?.[0]?.appliesTo?.[0]?.text).toBe('female_Follikelphase');
  });

  it('IU fixture carries time-of-day window for cortisol-class questions', () => {
    const fixture = ALL_MARKER_CLASS_FIXTURES.find((f) => f.classId === 'arbitrary_iu')!;
    const bundle = bundleFromMarkerClassFixture(fixture);
    const obs = bundle.entry?.find((e) => isObservation(e.resource))?.resource;
    if (!isObservation(obs)) throw new Error('missing Observation');
    expect(obs.extension?.some((e) => e.url === EXT_TOD_WINDOW && e.valueCode === 'vor_10h')).toBe(
      true,
    );
  });
});
