/**
 * A representative BodyLoop measurement payload, one list per scope.
 *
 * The angle, distance, axis and cross-section entries are the recorded response
 * that ships with the handover, unchanged — including the radian angles that the
 * unit conversion is checked against. The cross-section entry additionally
 * carries `skeletonPosition` and `details`, which the API schema marks required
 * and the previous fixture omitted: it only type-checked because it was cast
 * through `as unknown`, so the integration test proved the mappers could handle
 * data the API cannot produce.
 *
 * The marker, height and property entries are composed from the same recorded
 * marker plus plausible values, because the recorded response covers only four
 * of the seven scopes.
 *
 * Everything is parsed through the real schemas on the way out, so a fixture
 * that drifts from the contract fails here rather than downstream.
 */
import { MEASUREMENT_SCHEMAS, type MeasurementData } from '../../api/schemas/shared';
import type { Scope } from '../../config/constants';

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

const RAW: Record<Scope, unknown> = {
  angle: [
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
      details: { at_marker: exampleMarker, from_marker: exampleMarker, to_marker: exampleMarker }
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
      details: { at_marker: exampleMarker, from_marker: exampleMarker, to_marker: exampleMarker }
    }
  ],
  distance: [
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
      details: { from_marker: exampleMarker, to_marker: exampleMarker }
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
      details: { from_marker: exampleMarker, to_marker: exampleMarker }
    }
  ],
  axis: [
    {
      label: 'Outer Ankle',
      note: null,
      style: null,
      key_external: null,
      hidden: null,
      axis_path: 'leg.lateral.malleolus',
      markers: ['leg.lateral.malleolus.L', 'leg.lateral.malleolus.R'],
      rotation: { xy: 0.0053695912546394275, yz: -0.32149615939362786, xz: -0.0017883613867235582 },
      details: { markers: [exampleMarker, exampleMarker] }
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
      details: { markers: [exampleMarker, exampleMarker] }
    }
  ],
  cross_section: [
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
      },
      skeletonPosition: { series_path: 'torso.cingulum_praefere_posterior', distanceFromRoot: 1.0277 },
      details: { at_marker: exampleMarker }
    }
  ],
  marker: [exampleMarker],
  height: [
    {
      label: 'Body Height',
      note: null,
      style: null,
      key_external: null,
      hidden: false,
      height_path: 'stature.vertex.M',
      at_marker: 'stick_model.head.vertex.M',
      height: 1.7523504638671,
      details: { at_marker: exampleMarker }
    }
  ],
  properties: [
    {
      label: 'Scanner software version',
      note: null,
      style: null,
      key_external: null,
      hidden: null,
      property_path: 'scan.software_version',
      value: '2.4.1'
    },
    {
      label: 'Body mass index',
      note: null,
      style: null,
      key_external: null,
      hidden: null,
      property_path: 'body.mass_index',
      value: 22.4
    },
    {
      label: 'Body weight source',
      note: null,
      style: null,
      key_external: null,
      hidden: null,
      property_path: 'body.weight_source',
      value: null
    }
  ]
};

/** The fixture for one scope, validated against the schema the client applies. */
export function samplePayload<T extends Scope>(scope: T): MeasurementData<T> {
  return MEASUREMENT_SCHEMAS[scope].parse(RAW[scope]) as MeasurementData<T>;
}
