import type { Bundle, Observation } from 'fhir/r4';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BodyLoopClient } from '../..';
import type { MeasurementData } from '../../api/schemas/shared';
import type { Scope } from '../../config/constants';
import { getFhirBundleFromBodyloopMeasurementData } from '../../fhir/bundleBuilder';

const VITRONIC = 'https://www.vitronic.com/bodyloop/measurements';
const UCUM = 'http://unitsofmeasure.org';
const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';

function observationsFrom(bundle: Bundle): Observation[] {
  return (bundle.entry ?? []).map((entry) => entry.resource as Observation);
}

function findByCode(bundle: Bundle, code: string): Observation | undefined {
  return observationsFrom(bundle).find((observation) => observation.code.coding?.[0].code === code);
}

describe('getFhirBundleFromBodyloopMeasurementData (integration)', () => {
  const exampleMarker = {
    label: 'Shoulder Joint Right',
    note: null,
    style: null,
    key_external: null,
    hidden: false,
    marker_type: 'AutoMarker',
    marker_path: 'stick_model.arm.shoulder.R',
    position: [-0.1600305587053299, 0.1278497874736786, 1.4873504638671875],
    normal: [0, 0, 0]
  };
  const exampleBodyloopMeasurementData = [
    [
      {
        label: 'Shoulder Joint Right',
        note: null,
        style: null,
        key_external: null,
        hidden: false,
        angle_path: 'arm.shoulder.R',
        at_marker: 'stick_model.arm.shoulder.R',
        from_marker: 'stick_model.arm.arm.R',
        to_marker: 'stick_model.torso.spine1.M',
        angles: { primary: 1.4816501199902758, supplementary: 1.6599425335995173, conjugate: 4.801535187189311 },
        preference: 'primary',
        details: {
          at_marker: exampleMarker,
          from_marker: exampleMarker,
          to_marker: exampleMarker
        }
      },
      {
        label: 'Shoulder Joint Left',
        note: null,
        style: null,
        key_external: null,
        hidden: false,
        angle_path: 'arm.shoulder.L',
        at_marker: 'stick_model.arm.shoulder.L',
        from_marker: 'stick_model.arm.arm.L',
        to_marker: 'stick_model.torso.spine1.M',
        angles: { primary: 1.4672889937887372, supplementary: 1.6743036598010559, conjugate: 4.815896313390849 },
        preference: 'primary',
        details: {
          at_marker: exampleMarker,
          from_marker: exampleMarker,
          to_marker: exampleMarker
        }
      }
    ],
    [
      {
        label: 'Shoulder Width',
        note: null,
        style: null,
        key_external: null,
        hidden: null,
        distance_path: 'torso.shoulder.M',
        from_marker: 'arm.acromion.R',
        to_marker: 'arm.acromion.L',
        distances: {
          linear_distance: 0.444,
          linear_distance_x: 0.4435584247112274,
          linear_distance_y: 0.0006640702486038208,
          linear_distance_z: 0.005529999732971191
        },
        preference: null,
        details: {
          from_marker: exampleMarker,
          to_marker: exampleMarker
        }
      },
      {
        label: 'Hip width',
        note: null,
        style: null,
        key_external: null,
        hidden: null,
        distance_path: 'leg.hip.M',
        from_marker: 'leg.trochanterion.R',
        to_marker: 'leg.trochanterion.L',
        distances: {
          linear_distance: 0.359,
          linear_distance_x: 0.359340563416481,
          linear_distance_y: 0.0023319795727729797,
          linear_distance_z: 0.0022823214530944824
        },
        preference: null,
        details: {
          from_marker: exampleMarker,
          to_marker: exampleMarker
        }
      }
    ],
    [
      {
        label: 'Outer Ankle',
        note: null,
        style: null,
        key_external: null,
        hidden: null,
        axis_path: 'leg.lateral.malleolus',
        markers: ['leg.lateral.malleolus.L', 'leg.lateral.malleolus.R'],
        rotation: { xy: 0.0053695912546394275, yz: -0.32149615939362786, xz: -0.0017883613867235582 },
        details: {
          markers: [exampleMarker, exampleMarker]
        }
      },
      {
        label: 'Hip Bone',
        note: null,
        style: null,
        key_external: null,
        hidden: null,
        axis_path: 'leg.trochanterion',
        markers: ['leg.trochanterion.L', 'leg.trochanterion.R'],
        rotation: { xy: -0.006489517393493571, yz: -0.7746367929397167, xz: 0.006351330732472071 },
        details: {
          markers: [exampleMarker, exampleMarker]
        }
      }
    ],
    [
      {
        label: 'Waist Back Point',
        note: null,
        style: null,
        key_external: null,
        hidden: null,
        crosssection_path: 'torso.cingulum_praefere_posterior.M',
        preference: 'convex',
        circumferences: { convex_circumference: 1.0411115884780884, perimeter_circumference: 1.2969887256622314 },
        areas: { convex_area: 0.08067300915718079, perimeter_area: 0.07914557307958603 },
        contours: {
          convex_contour: {
            '3D': [
              [-0.1752, 0.085, 1.0298],
              [-0.1751, 0.0874, 1.03]
            ],
            '2D': [
              [-0.1889, -0.0152],
              [-0.1888, -0.0127]
            ]
          },
          perimeter_contour: {
            '3D': [
              [-0.1731, 0.0657, 1.0277],
              [-0.1733, 0.0671, 1.0278]
            ],
            '2D': [
              [0.1692, -0.0007],
              [0.1692, -0.0009]
            ]
          }
        }
      }
    ]
  ];

  const scopes: Scope[] = ['angle', 'distance', 'axis', 'cross_section'];

  const client = new BodyLoopClient({
    baseUrl: 'https://api.bodyloop.com',
    username: 'test',
    password: 'test',
    scope: 'admin'
  });

  it('maps a bodyloop measurement data to a FHIR bundle', async () => {
    vi.spyOn(client, 'getMeasurementsData').mockResolvedValue(
      exampleBodyloopMeasurementData as unknown as MeasurementData<Scope>[]
    );

    const bundle = await getFhirBundleFromBodyloopMeasurementData(client, 'scan-1', scopes);

    expect(client.getMeasurementsData).toHaveBeenCalledWith('scan-1', scopes);
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');

    expect(bundle.entry).toHaveLength(7);
    for (const entry of bundle.entry ?? []) {
      expect((entry.resource as Observation).resourceType).toBe('Observation');
    }

    expect(bundle).toMatchSnapshot();
  });

  it('returns an empty bundle when no measurement data is available', async () => {
    vi.spyOn(client, 'getMeasurementsData').mockResolvedValue([]);

    const bundle: Bundle = await getFhirBundleFromBodyloopMeasurementData(client, 'scan-empty', []);

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(bundle.entry).toEqual([]);
  });

  describe('detailed observation mapping', () => {
    let bundle: Bundle;

    beforeAll(async () => {
      vi.spyOn(client, 'getMeasurementsData').mockResolvedValue(
        exampleBodyloopMeasurementData as unknown as MeasurementData<Scope>[]
      );
      bundle = await getFhirBundleFromBodyloopMeasurementData(client, 'scan-1', scopes);
    });

    it('references the scan id as the subject on every observation', () => {
      const observations = observationsFrom(bundle);
      expect(observations).toHaveLength(7);
      for (const observation of observations) {
        expect(observation.subject).toEqual({ reference: 'Scan/scan-1' });
        expect(observation.status).toBe('final');
        expect(observation.category).toEqual([
          { coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }
        ]);
      }
    });

    it('maps an angle measurement to a degree Observation with supplementary and conjugate components', () => {
      const observation = findByCode(bundle, 'arm.shoulder.R');

      expect(observation?.code.coding?.[0]).toEqual({
        system: VITRONIC,
        code: 'arm.shoulder.R',
        display: 'Shoulder Joint Right'
      });
      expect(observation?.valueQuantity).toEqual({
        value: 1.4816501199902758,
        unit: 'degree',
        system: UCUM,
        code: 'deg'
      });
      expect(observation?.component).toEqual([
        {
          code: {
            coding: [{ system: VITRONIC, code: 'arm.shoulder.R#supplementary', display: 'Supplementary angle' }]
          },
          valueQuantity: { value: 1.6599425335995173, unit: 'degree', system: UCUM, code: 'deg' }
        },
        {
          code: { coding: [{ system: VITRONIC, code: 'arm.shoulder.R#conjugate', display: 'Conjugate angle' }] },
          valueQuantity: { value: 4.801535187189311, unit: 'degree', system: UCUM, code: 'deg' }
        }
      ]);
    });

    it('maps a distance measurement to a metre Observation with x/y/z components', () => {
      const observation = findByCode(bundle, 'torso.shoulder.M');

      expect(observation?.code.coding?.[0].display).toBe('Shoulder Width');
      expect(observation?.valueQuantity).toEqual({
        value: 0.444,
        unit: 'meters',
        system: UCUM,
        code: 'm'
      });
      expect(observation?.component).toEqual([
        {
          code: { coding: [{ system: VITRONIC, code: 'torso.shoulder.M.x', display: 'Shoulder Width (X axis)' }] },
          valueQuantity: { value: 0.4435584247112274, unit: 'meters', system: UCUM, code: 'm' }
        },
        {
          code: { coding: [{ system: VITRONIC, code: 'torso.shoulder.M.y', display: 'Shoulder Width (Y axis)' }] },
          valueQuantity: { value: 0.0006640702486038208, unit: 'meters', system: UCUM, code: 'm' }
        },
        {
          code: { coding: [{ system: VITRONIC, code: 'torso.shoulder.M.z', display: 'Shoulder Width (Z axis)' }] },
          valueQuantity: { value: 0.005529999732971191, unit: 'meters', system: UCUM, code: 'm' }
        }
      ]);
    });

    it('maps an axis measurement to an Observation with rotation components and no top-level value', () => {
      const observation = findByCode(bundle, 'leg.lateral.malleolus');

      expect(observation?.code.coding?.[0].display).toBe('Outer Ankle');
      expect(observation?.valueQuantity).toBeUndefined();
      expect(observation?.component).toEqual([
        {
          code: {
            coding: [{ system: VITRONIC, code: 'leg.lateral.malleolus.xy', display: 'Outer Ankle (Rotation XY axis)' }]
          },
          valueQuantity: { value: 0.0053695912546394275, unit: 'degree', system: UCUM, code: 'deg' }
        },
        {
          code: {
            coding: [{ system: VITRONIC, code: 'leg.lateral.malleolus.yz', display: 'Outer Ankle (Rotation YZ axis)' }]
          },
          valueQuantity: { value: -0.32149615939362786, unit: 'degree', system: UCUM, code: 'deg' }
        },
        {
          code: {
            coding: [{ system: VITRONIC, code: 'leg.lateral.malleolus.xz', display: 'Outer Ankle (Rotation XZ axis)' }]
          },
          valueQuantity: { value: -0.0017883613867235582, unit: 'degree', system: UCUM, code: 'deg' }
        }
      ]);
    });

    it('maps a cross section measurement to a square-millimetre Observation with area and circumference components', () => {
      const observation = findByCode(bundle, 'torso.cingulum_praefere_posterior.M');

      expect(observation?.code.coding?.[0].display).toBe('Waist Back Point');
      expect(observation?.valueQuantity).toEqual({
        value: 0.08067300915718079,
        unit: 'square meter',
        system: UCUM,
        code: 'm2'
      });
      const componentValues = observation?.component?.map((component) => component.valueQuantity?.value);
      expect(componentValues).toEqual([
        0.08067300915718079, 0.07914557307958603, 1.0411115884780884, 1.2969887256622314
      ]);
      const componentDisplays = observation?.component?.map((component) => component.code.coding?.[0].display);
      expect(componentDisplays).toEqual([
        'Waist Back Point (Convex Area)',
        'Waist Back Point (Perimeter Area)',
        'Waist Back Point (Convex Circumference)',
        'Waist Back Point (Perimeter Circumference)'
      ]);
    });

    it('includes both entries for measurement types with multiple items', () => {
      expect(findByCode(bundle, 'arm.shoulder.L')?.code.coding?.[0].display).toBe('Shoulder Joint Left');
      expect(findByCode(bundle, 'leg.hip.M')?.code.coding?.[0].display).toBe('Hip width');
      expect(findByCode(bundle, 'leg.trochanterion')?.code.coding?.[0].display).toBe('Hip Bone');
    });
  });

  it('maps only the requested scope when a single scope is provided', async () => {
    vi.spyOn(client, 'getMeasurementsData').mockResolvedValue([
      exampleBodyloopMeasurementData[1]
    ] as unknown as MeasurementData<Scope>[]);

    const bundle = await getFhirBundleFromBodyloopMeasurementData(client, 'scan-2', ['distance']);

    expect(client.getMeasurementsData).toHaveBeenCalledWith('scan-2', ['distance']);
    const observations = observationsFrom(bundle);
    expect(observations).toHaveLength(2);
    expect(observations.map((observation) => observation.code.coding?.[0].code)).toEqual([
      'torso.shoulder.M',
      'leg.hip.M'
    ]);
  });
});
