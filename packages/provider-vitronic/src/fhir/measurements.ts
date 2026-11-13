/**
 * WHAT: Declares which measurements the VITRONIC BodyLoop connector emits — one declaration per known measurement path and per component it carries.
 * NOT:  Converts nothing, chooses no codes and asserts no LOINC/SNOMED; the mappers own codes, units and values, and this file only describes them.
 * GOVERNED BY: DECISIONS.md#d18; DECISIONS.md#d10; DECISIONS.md#d15
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Every code is a BodyLoop measurement path the scanner chooses (`angle_path`, `marker_path`, `property_path`, …), not one this connector mints, and the API documents no closed list. Only paths seen in the recorded 0.13.7 payload or fixed by D15 are declared, so coverage is `open`. Adding a path needs a recorded payload, not a guess.
 */
import {
  declareMeasurement,
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementCoding,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  type MeasurementValueType
} from '@open-twin/fhir-core';
import { VT_UCUM } from './mappers/properties';
import { CONNECTOR, humanizePath, SYSTEMS, UCUM } from './mappers/shared';

/* -------------------------------------------------------------------------- */
/* Known paths                                                                */
/* -------------------------------------------------------------------------- */

/** A BodyLoop path, spelled exactly as the API spells it, and the scanner's own label for it. */
interface KnownPath {
  path: string;
  label: string;
}

/** `angle_path` values in the recorded 0.13.7 response. */
const RECORDED_ANGLE_PATHS: readonly KnownPath[] = [
  { path: 'arm.shoulder.R', label: 'Shoulder Joint Right' },
  { path: 'arm.shoulder.L', label: 'Shoulder Joint Left' }
];

/** `axis_path` values in the recorded 0.13.7 response. */
const RECORDED_AXIS_PATHS: readonly KnownPath[] = [
  { path: 'leg.lateral.malleolus', label: 'Outer Ankle' },
  { path: 'leg.trochanterion', label: 'Hip Bone' }
];

/** `crosssection_path` values in the recorded 0.13.7 response. */
const RECORDED_CROSS_SECTION_PATHS: readonly KnownPath[] = [
  { path: 'torso.cingulum_praefere_posterior.M', label: 'Waist Back Point' }
];

/** `distance_path` values in the recorded 0.13.7 response. */
const RECORDED_DISTANCE_PATHS: readonly KnownPath[] = [
  { path: 'torso.shoulder.M', label: 'Shoulder Width' },
  { path: 'leg.hip.M', label: 'Hip width' }
];

/**
 * Marker paths the recorded 0.13.7 response names: the one `marker_path` it
 * carries, plus every `at_marker`/`from_marker`/`to_marker`/`markers[]` reference
 * of the recorded angles, distances and axes. A reference resolves only to a
 * marker whose `marker_path` is spelled the same, so these are spelled verbatim —
 * with and without the `stick_model.` namespace, exactly as recorded.
 */
const RECORDED_MARKER_PATHS: readonly string[] = [
  'stick_model.arm.shoulder.R',
  'stick_model.arm.shoulder.L',
  'stick_model.arm.arm.R',
  'stick_model.arm.arm.L',
  'stick_model.torso.spine1.M',
  'arm.acromion.R',
  'arm.acromion.L',
  'leg.trochanterion.R',
  'leg.trochanterion.L',
  'leg.lateral.malleolus.R',
  'leg.lateral.malleolus.L'
];

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

interface Entry {
  definition: MeasurementDefinition;
  coding: MeasurementCoding;
  parent?: MeasurementCoding;
}

/** One BodyLoop measurement is one scan result: a reading, never a summary. */
const SCAN_READING = { scope: 'reading' } as const;

/** `arm.shoulder.R` -> `arm.shoulder.r`; key segments are lower kebab-case. */
function keyPath(path: string): string {
  return path
    .split('.')
    .map((segment) => segment.toLowerCase().replace(/_/g, '-'))
    .join('.');
}

function vitronic(code: string): MeasurementCoding {
  return { system: SYSTEMS.VITRONIC, code };
}

function definition(
  key: string,
  description: string,
  valueType: MeasurementValueType,
  unit?: string
): MeasurementDefinition {
  return {
    key: `${CONNECTOR.connector}:${key}`,
    description,
    valueType,
    ...(unit !== undefined ? { canonicalUnit: unit } : {}),
    context: SCAN_READING
  };
}

function component(key: string, description: string, unit: string, code: string, parent: MeasurementCoding): Entry {
  return { definition: definition(key, description, 'quantity', unit), coding: vitronic(code), parent };
}

/** `angle.ts`: the preferred aspect as the value, all three aspects as components. */
function angleEntries({ path, label }: KnownPath): Entry[] {
  const parent = vitronic(path);
  const key = `angle.${keyPath(path)}`;
  const named = `${label} (BodyLoop angle_path ${path})`;
  const aspect = (name: string, meaning: string): Entry =>
    component(
      `${key}.${name}`,
      `${named}: ${meaning}, in degrees converted from the API's radians (D10).`,
      UCUM.DEGREE.code,
      `${path}#${name}`,
      parent
    );
  return [
    {
      definition: definition(
        key,
        `${named}: the angle aspect the scanner marks as preferred (primary when unset), in degrees converted from the API's radians (D10).`,
        'quantity',
        UCUM.DEGREE.code
      ),
      coding: parent
    },
    aspect('primary', 'angle at the vertex marker between the from- and to-markers'),
    aspect('supplementary', 'supplement of the primary angle (180 degrees minus primary)'),
    aspect('conjugate', 'conjugate of the primary angle (360 degrees minus primary)')
  ];
}

/** `axes.ts`: a panel with no value of its own; the three plane rotations are its components. */
function axisEntries({ path, label }: KnownPath): Entry[] {
  const parent = vitronic(path);
  const key = `axis.${keyPath(path)}`;
  const named = `${label} (BodyLoop axis_path ${path})`;
  return [
    {
      definition: definition(
        key,
        `${named}: panel for the axis through its markers. Carries no value; the plane rotations are its components.`,
        'none'
      ),
      coding: parent
    },
    ...(['xy', 'yz', 'xz'] as const).map((plane) =>
      component(
        `${key}.rotation-${plane}`,
        `${named}: rotation of the axis in the scanner's ${plane} plane, in degrees converted from the API's radians (D10).`,
        UCUM.DEGREE.code,
        `${path}.${plane}`,
        parent
      )
    )
  ];
}

/** `crosssection.ts`: the preferred circumference as the value; both contours, both areas and the series position as components. */
function crossSectionEntries({ path, label }: KnownPath): Entry[] {
  const parent = vitronic(path);
  const key = `cross-section.${keyPath(path)}`;
  const named = `${label} (BodyLoop crosssection_path ${path})`;
  const contour = { convex: 'convex hull (tape-measure equivalent)', perimeter: 'skin perimeter' } as const;
  return [
    {
      definition: definition(
        key,
        `${named}: circumference of the contour the scanner marks as preferred (convex hull unless preference is perimeter), in metres.`,
        'quantity',
        UCUM.METRE.code
      ),
      coding: parent
    },
    ...(['convex', 'perimeter'] as const).map((name) =>
      component(
        `${key}.${name}-circumference`,
        `${named}: circumference of the ${contour[name]} contour, in metres.`,
        UCUM.METRE.code,
        `${path}#${name}-circumference`,
        parent
      )
    ),
    ...(['convex', 'perimeter'] as const).map((name) =>
      component(
        `${key}.${name}-area`,
        `${named}: area enclosed by the ${contour[name]} contour, in square metres. Absent when the API omits the areas block.`,
        UCUM.SQUARE_METRE.code,
        `${path}#${name}-area`,
        parent
      )
    ),
    component(
      `${key}.distance-from-root`,
      `${named}: position of the cross-section along its skeleton series, as distance from the series root. Emitted in metres; the API states no unit (mapper TODO).`,
      UCUM.METRE.code,
      `${path}#distance-from-root`,
      parent
    )
  ];
}

/** `distance.ts`: the preferred aspect as the value; the linear distance and its axis components as components. */
function distanceEntries({ path, label }: KnownPath): Entry[] {
  const parent = vitronic(path);
  const key = `distance.${keyPath(path)}`;
  const named = `${label} (BodyLoop distance_path ${path})`;
  const aspects = [
    ['linear', 'straight-line distance between the from- and to-markers'],
    ['x', 'x component of the marker-to-marker distance'],
    ['y', 'y component of the marker-to-marker distance'],
    ['z', 'z component of the marker-to-marker distance']
  ] as const;
  return [
    {
      definition: definition(
        key,
        `${named}: the distance aspect the scanner marks as preferred (straight-line distance when unset), in metres.`,
        'quantity',
        UCUM.METRE.code
      ),
      coding: parent
    },
    ...aspects.map(([code, meaning]) =>
      component(`${key}.${code}`, `${named}: ${meaning}, in metres.`, UCUM.METRE.code, `${path}.${code}`, parent)
    )
  ];
}

/** `marker.ts`: a panel with no value of its own; position and surface normal are its components. */
function markerEntries(path: string): Entry[] {
  const parent = vitronic(path);
  const key = `marker.${keyPath(path)}`;
  const named = `${humanizePath(path)} landmark (BodyLoop marker_path ${path})`;
  return [
    {
      definition: definition(
        key,
        `${named}: panel for one anatomical landmark. Carries no value; position and surface normal are its components.`,
        'none'
      ),
      coding: parent
    },
    ...(['x', 'y', 'z'] as const).map((axis) =>
      component(
        `${key}.position-${axis}`,
        `${named}: ${axis} coordinate of the landmark in the scanner's frame, in metres.`,
        UCUM.METRE.code,
        `${path}.${axis}`,
        parent
      )
    ),
    ...(['x', 'y', 'z'] as const).map((axis) =>
      component(
        `${key}.normal-${axis}`,
        `${named}: ${axis} component of the unit surface normal at the landmark — a dimensionless direction cosine, not an angle (D10). Absent when the API sends no normal.`,
        UCUM.UNITY.code,
        `${path}.normal.${axis}`,
        parent
      )
    )
  ];
}

/**
 * `properties.ts`: the five `property_path` values D15 binds to an SI unit, from
 * the live 0.13.7 API. Every other property path is an untyped vendor key whose
 * value type and unit are unknown, so it cannot be declared.
 */
const D15_PROPERTIES: readonly { path: string; meaning: string; unit: string }[] = [
  {
    path: 'body.height',
    meaning:
      'body height as the scanner reports it, in metres. Not the shared body-height key, whose canonical unit is cm',
    unit: UCUM.METRE.code
  },
  {
    path: 'body.surface',
    meaning: 'body surface area as the scanner reports it, in square metres',
    unit: UCUM.SQUARE_METRE.code
  },
  {
    path: 'body.volume',
    meaning: 'body volume as the scanner reports it, in cubic metres (not litres)',
    unit: VT_UCUM.CUBIC_METRE.code
  },
  {
    path: 'body.mass',
    meaning: 'body mass as the scanner reports it, in kilograms. How the scanner obtains it is undocumented',
    unit: UCUM.KILOGRAM.code
  },
  {
    path: 'body.bmi',
    meaning:
      'body mass index as the scanner reports it, in kg/m2. Passed through, not recomputed: it does not equal body.mass / body.height squared on this device',
    unit: VT_UCUM.KILOGRAM_PER_SQUARE_METRE.code
  }
];

function propertyEntry({ path, meaning, unit }: (typeof D15_PROPERTIES)[number]): Entry {
  return {
    definition: definition(
      `property.${keyPath(path)}`,
      `BodyLoop property_path ${path}: ${meaning} (D15).`,
      'quantity',
      unit
    ),
    coding: vitronic(path)
  };
}

const ENTRIES: readonly Entry[] = [
  ...RECORDED_ANGLE_PATHS.flatMap(angleEntries),
  ...RECORDED_AXIS_PATHS.flatMap(axisEntries),
  ...RECORDED_CROSS_SECTION_PATHS.flatMap(crossSectionEntries),
  ...RECORDED_DISTANCE_PATHS.flatMap(distanceEntries),
  ...RECORDED_MARKER_PATHS.flatMap(markerEntries),
  ...D15_PROPERTIES.map(propertyEntry)
];

/**
 * What the VITRONIC connector emits, for the paths known today.
 *
 * `open`: the codes are scanner-chosen measurement paths with no documented
 * closed list, so an emitted path outside the recorded payload and D15 is
 * forwarded undeclared rather than guessed at. No height_path is known, so the
 * height mapper's output is never declared.
 */
export const VITRONIC_MEASUREMENTS: MeasurementDeclarationSet = {
  schemaVersion: MEASUREMENT_SCHEMA_VERSION,
  connector: CONNECTOR.connector,
  version: 1,
  coverage: 'open',
  definitions: ENTRIES.map((entry) => entry.definition),
  declarations: ENTRIES.map((entry) => declareMeasurement(entry.definition, entry.coding, entry.parent))
};
