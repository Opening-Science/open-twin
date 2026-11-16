/**
 * A BodyLoop payload carrying every measurement path `VITRONIC_MEASUREMENTS`
 * declares, so the declaration audit can prove each declaration against what the
 * real mappers emit.
 *
 * The angle, axis, cross-section and distance lists are the recorded 0.13.7
 * response from `samplePayload`, unchanged. The recorded response carries the
 * full marker object for only one landmark and no property list, so the other
 * marker entries are composed for the marker paths the recorded measures
 * reference — positions and normals plausible, not recorded — and the property
 * entries are the five D15 paths with plausible values. Nothing here is personal
 * data.
 *
 * Everything is parsed through the real schemas, so a fixture that drifts from
 * the contract fails here rather than in the audit.
 */
import { type MarkerList, MarkerListSchema } from '../../api/schemas/marker';
import { type PropertyList, PropertyListSchema } from '../../api/schemas/properties';
import type { VitronicMeasurementResponse } from '../../fhir/bundleBuilder';
import { samplePayload } from './samplePayload';

const NO_COMMON = { label: null, note: null, style: null, key_external: null, hidden: null };

function marker(marker_path: string, position: number[], normal: number[] | null): unknown {
  return { ...NO_COMMON, marker_type: 'AutoMarker', marker_path, position, normal };
}

const MARKERS: unknown[] = [
  // The one marker object the recorded response carries in full.
  {
    label: 'Shoulder Joint Right',
    note: null,
    style: null,
    key_external: null,
    hidden: false,
    marker_type: 'AutoMarker',
    marker_path: 'stick_model.arm.shoulder.R',
    position: [-0.1600305587053299, 0.1278497874736786, 1.4873504638671875],
    normal: [0, 0, 0]
  },
  marker('stick_model.arm.shoulder.L', [0.1585, 0.1262, 1.4869], [0.9986, 0.0349, 0.0399]),
  marker('stick_model.arm.arm.R', [-0.1812, 0.1174, 1.2651], [-0.9945, 0.0872, 0.0577]),
  marker('stick_model.arm.arm.L', [0.1797, 0.1183, 1.2667], [0.9945, 0.0872, 0.0577]),
  marker('stick_model.torso.spine1.M', [-0.0011, 0.0472, 1.1803], [0.0105, -0.9998, 0.0175]),
  marker('arm.acromion.R', [-0.2219, 0.0612, 1.4987], [-0.6428, 0, 0.766]),
  marker('arm.acromion.L', [0.2217, 0.0605, 1.4931], [0.6428, 0, 0.766]),
  marker('leg.trochanterion.R', [-0.1797, 0.0491, 0.9123], [-0.9998, 0.0175, 0.0105]),
  marker('leg.trochanterion.L', [0.1796, 0.0468, 0.9146], [0.9998, 0.0175, 0.0105]),
  marker('leg.lateral.malleolus.R', [-0.1254, 0.0187, 0.0712], [-0.9848, 0.1736, 0]),
  marker('leg.lateral.malleolus.L', [0.1262, 0.0215, 0.0696], [0.9848, 0.1736, 0])
];

function property(property_path: string, label: string, value: unknown): unknown {
  return { ...NO_COMMON, label, property_path, value };
}

const PROPERTIES: unknown[] = [
  property('body.height', 'Body height', 1.7523),
  property('body.surface', 'Body surface', 1.8912),
  property('body.volume', 'Body volume', 0.0702),
  property('body.mass', 'Body mass', 71.2),
  // Deliberately not mass / height squared: the scanner's own figure is passed through (D15).
  property('body.bmi', 'Body mass index', 22.9)
];

export function knownMarkers(): MarkerList {
  return MarkerListSchema.parse(MARKERS);
}

export function knownProperties(): PropertyList {
  return PropertyListSchema.parse(PROPERTIES);
}

/** Every declared path, as one scan. No `height` list: no height_path is known. */
export function knownPathsResponse(): VitronicMeasurementResponse {
  return {
    scan_id: '4711',
    subjectKey: 'proband/1',
    effectiveDateTime: '2026-07-25T09:15:00+02:00',
    timestamp: '2026-07-25T09:15:00+02:00',
    angle: samplePayload('angle'),
    axis: samplePayload('axis'),
    cross_section: samplePayload('cross_section'),
    distance: samplePayload('distance'),
    marker: knownMarkers(),
    properties: knownProperties()
  };
}
