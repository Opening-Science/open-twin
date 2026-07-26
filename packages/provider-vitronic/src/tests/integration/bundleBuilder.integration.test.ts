import { ConnectorError } from '@open-twin/fhir-core';
import type { Bundle, Observation, Patient } from 'fhir/r4';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BodyLoopClient } from '../..';
import type { ScopeResult } from '../../api/client';
import type { Viatar } from '../../api/schemas/viatars';
import type { Scope } from '../../config/constants';
import { getFhirBundleFromBodyloopMeasurementData } from '../../fhir/bundleBuilder';
import { samplePayload } from '../fixtures/samplePayload';

const VITRONIC = 'http://opentwin.ch/fhir/CodeSystem/vitronic';
const VITRONIC_IDENTIFIER = 'http://opentwin.ch/fhir/sid/vitronic';
const UCUM = 'http://unitsofmeasure.org';
const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';

const SCAN_ID = 'scan-1';
const CRTIME = '2026-07-25T09:15:00+02:00';

function observationsFrom(bundle: Bundle): Observation[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is Observation => resource?.resourceType === 'Observation');
}

function findByCode(bundle: Bundle, code: string): Observation | undefined {
  return observationsFrom(bundle).find((observation) => observation.code.coding?.[0].code === code);
}

function scopeResults(scopes: Scope[]): ScopeResult<Scope>[] {
  return scopes.map((scope) => ({ scope, data: samplePayload(scope) }));
}

describe('getFhirBundleFromBodyloopMeasurementData (integration)', () => {
  const scopes: Scope[] = ['angle', 'distance', 'axis', 'cross_section', 'marker', 'height', 'properties'];

  const viatar: Viatar = {
    viatar_id: 1,
    proband_id: 7,
    meta: { crtime: CRTIME, mtime: CRTIME, info: null }
  };

  const client = new BodyLoopClient({
    baseUrl: 'https://api.bodyloop.com',
    username: 'test',
    password: 'test',
    scope: 'admin'
  });

  function mockClient(results: ScopeResult<Scope>[] = scopeResults(scopes), scan: Viatar = viatar): void {
    vi.spyOn(client, 'getViatar').mockResolvedValue(scan);
    vi.spyOn(client, 'getMeasurementsData').mockResolvedValue(results);
  }

  it('maps a bodyloop measurement payload to a FHIR bundle', async () => {
    mockClient();

    const { bundle, issues } = await getFhirBundleFromBodyloopMeasurementData(client, SCAN_ID, scopes);

    expect(client.getMeasurementsData).toHaveBeenCalledWith(SCAN_ID, scopes);
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(issues).toBeUndefined();

    // One Patient plus ten measurements: 2 angles, 2 distances, 2 axes,
    // 1 cross-section, 1 marker, 1 height, 3 properties.
    expect(bundle.entry).toHaveLength(13);
    expect(observationsFrom(bundle)).toHaveLength(12);

    expect(bundle).toMatchSnapshot();
  });

  it('returns an empty-of-measurements bundle when no data is available', async () => {
    mockClient([]);

    const { bundle } = await getFhirBundleFromBodyloopMeasurementData(client, 'scan-empty', []);

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(observationsFrom(bundle)).toEqual([]);
  });

  it('keeps the scopes that succeeded when one of them fails (D6)', async () => {
    mockClient([
      { scope: 'angle', data: samplePayload('angle') },
      {
        scope: 'distance',
        error: new ConnectorError('Rate limit exceeded', {
          code: 'rate_limit',
          connector: 'vitronic',
          operation: 'GET distance',
          status: 429
        })
      }
    ]);

    const { bundle, issues } = await getFhirBundleFromBodyloopMeasurementData(client, SCAN_ID, ['angle', 'distance']);

    expect(observationsFrom(bundle).map((observation) => observation.code.coding?.[0].code)).toEqual([
      'arm.shoulder.R',
      'arm.shoulder.L'
    ]);
    expect(issues?.resourceType).toBe('OperationOutcome');
    expect(issues?.issue).toEqual([
      {
        severity: 'warning',
        code: 'throttled',
        diagnostics: 'ConnectorError(vitronic): Rate limit exceeded [rate_limit GET distance HTTP 429]'
      }
    ]);
  });

  it('still builds the bundle when the viatar cannot be fetched, and says what failed', async () => {
    vi.spyOn(client, 'getViatar').mockRejectedValue(
      new ConnectorError('The requested resource does not exist', {
        code: 'not_found',
        connector: 'vitronic',
        operation: 'GET viatar',
        status: 404
      })
    );
    vi.spyOn(client, 'getMeasurementsData').mockResolvedValue([
      { scope: 'height', data: samplePayload('height') }
    ] as ScopeResult<Scope>[]);

    const { bundle, issues } = await getFhirBundleFromBodyloopMeasurementData(client, SCAN_ID, ['height']);

    expect(observationsFrom(bundle)).toHaveLength(1);
    // No viatar means no scan time and no proband: neither is invented.
    expect(observationsFrom(bundle)[0].effectiveDateTime).toBeUndefined();
    expect(issues?.issue?.[0].code).toBe('not-found');
  });

  describe('detailed observation mapping', () => {
    let bundle: Bundle;

    beforeAll(async () => {
      mockClient();
      bundle = (await getFhirBundleFromBodyloopMeasurementData(client, SCAN_ID, scopes)).bundle;
    });

    it('gives every observation the same resolvable subject and the scan time', () => {
      const patient = bundle.entry?.[0]?.resource as Patient;
      expect(patient.resourceType).toBe('Patient');
      expect(patient.identifier).toEqual([{ system: VITRONIC_IDENTIFIER, value: 'proband/7' }]);

      const subject = { reference: `urn:uuid:${patient.id}` };
      for (const observation of observationsFrom(bundle)) {
        expect(observation.subject).toEqual(subject);
        expect(observation.effectiveDateTime).toBe(CRTIME);
        expect(observation.status).toBe('final');
        expect(observation.category).toEqual([
          { coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }
        ]);
      }
    });

    it('addresses every entry, so a re-sent bundle can be correlated with the last one', () => {
      expect(bundle.id).toBeTypeOf('string');
      expect(bundle.timestamp).toBe(CRTIME);
      expect(bundle.meta?.tag).toEqual([
        { system: 'http://opentwin.ch/fhir/CodeSystem/connector', code: 'vitronic', version: '0.1.0' }
      ]);
      for (const entry of bundle.entry ?? []) {
        expect(entry.fullUrl).toBe(`urn:uuid:${entry.resource?.id}`);
        expect(entry.resource?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      }
    });

    /**
     * 1.4816501199902758 rad is 84.8923 deg. The previous output published the
     * radian value under UCUM `deg`, so a shoulder that is open 85 degrees was
     * reported as 1.48 degrees.
     */
    it('publishes a shoulder angle of 84.8923 degrees', () => {
      const observation = findByCode(bundle, 'arm.shoulder.R');

      expect(observation?.code.coding?.[0]).toEqual({
        system: VITRONIC,
        code: 'arm.shoulder.R',
        display: 'Angle arm.shoulder.R'
      });
      expect(observation?.code.text).toBe('Shoulder Joint Right');
      expect(observation?.valueQuantity).toEqual({ value: 84.8923, unit: 'degree', system: UCUM, code: 'deg' });
      expect(observation?.component?.map((component) => component.valueQuantity?.value)).toEqual([
        84.8923, 95.1077, 275.1077
      ]);
      // Primary and supplementary are supplementary angles: they must sum to 180.
      expect(84.8923 + 95.1077).toBe(180);
      expect(observation?.bodySite).toEqual({ text: 'Arm shoulder (right)' });
    });

    it('maps a distance measurement to a metre Observation with x/y/z components', () => {
      const observation = findByCode(bundle, 'torso.shoulder.M');

      expect(observation?.code.text).toBe('Shoulder Width');
      expect(observation?.valueQuantity).toEqual({ value: 0.444, unit: 'meter', system: UCUM, code: 'm' });
      expect(observation?.component?.map((component) => component.valueQuantity?.value)).toEqual([
        0.444, 0.4435584247112274, 0.0006640702486038208, 0.005529999732971191
      ]);
    });

    /** -0.7746367929397167 rad is -44.3834 deg. */
    it('publishes the hip axis rotations in degrees with no top-level value', () => {
      const observation = findByCode(bundle, 'leg.trochanterion');

      expect(observation?.valueQuantity).toBeUndefined();
      expect(observation?.component?.map((component) => component.valueQuantity?.value)).toEqual([
        -0.3718, -44.3834, 0.3639
      ]);
    });

    /**
     * The clinical measure of a body cross-section is its circumference. The
     * previous output promoted the enclosed area, so `value[x]` read 0.0807 m²
     * where a consumer expects 1.0411 m.
     */
    it('promotes the waist circumference and codes the areas as square metres', () => {
      const observation = findByCode(bundle, 'torso.cingulum_praefere_posterior.M');

      expect(observation?.valueQuantity).toEqual({
        value: 1.0411115884780884,
        unit: 'meter',
        system: UCUM,
        code: 'm'
      });
      expect(
        observation?.component?.map((component) => [
          component.code.coding?.[0].code,
          component.valueQuantity?.value,
          component.valueQuantity?.code
        ])
      ).toEqual([
        ['torso.cingulum_praefere_posterior.M#convex-circumference', 1.0411115884780884, 'm'],
        ['torso.cingulum_praefere_posterior.M#perimeter-circumference', 1.2969887256622314, 'm'],
        ['torso.cingulum_praefere_posterior.M#convex-area', 0.08067300915718079, 'm2'],
        ['torso.cingulum_praefere_posterior.M#perimeter-area', 0.07914557307958603, 'm2'],
        ['torso.cingulum_praefere_posterior.M#distance-from-root', 1.0277, 'm']
      ]);
    });

    it('emits marker surface normals as dimensionless, not as degrees', () => {
      const observation = findByCode(bundle, 'stick_model.arm.shoulder.R');
      const normals = observation?.component?.slice(3);

      expect(normals?.map((component) => component.valueQuantity?.code)).toEqual(['1', '1', '1']);
      expect(observation?.component?.slice(0, 3).map((component) => component.valueQuantity?.code)).toEqual([
        'm',
        'm',
        'm'
      ]);
    });

    it('records an absent property value rather than the literal string "null"', () => {
      const observation = findByCode(bundle, 'body.weight_source');

      expect(observation?.valueString).toBeUndefined();
      expect(observation?.dataAbsentReason?.coding?.[0].code).toBe('unknown');
    });

    it('includes every entry for measurement types with multiple items', () => {
      expect(findByCode(bundle, 'arm.shoulder.L')?.code.text).toBe('Shoulder Joint Left');
      expect(findByCode(bundle, 'leg.hip.M')?.code.text).toBe('Hip width');
      expect(findByCode(bundle, 'stature.vertex.M')?.valueQuantity?.value).toBe(1.7523504638671);
    });
  });

  it('maps only the requested scope when a single scope is provided', async () => {
    mockClient([{ scope: 'distance', data: samplePayload('distance') }]);

    const { bundle } = await getFhirBundleFromBodyloopMeasurementData(client, 'scan-2', ['distance']);

    expect(client.getMeasurementsData).toHaveBeenCalledWith('scan-2', ['distance']);
    expect(observationsFrom(bundle).map((observation) => observation.code.coding?.[0].code)).toEqual([
      'torso.shoulder.M',
      'leg.hip.M'
    ]);
  });
});
