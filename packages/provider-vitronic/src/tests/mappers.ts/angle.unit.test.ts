import type { Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { Angle } from '../../api/schemas/angle';
import { mapAngleListToFHIR, mapAngleToFHIR } from '../../fhir/mappers/angle';
import {
  CONTEXT,
  DATA_ABSENT_REASON,
  makeMarker,
  markerReferenceFor,
  measurementIdentifierFor,
  OBSERVATION_CATEGORY,
  RECORDED_AT,
  SCAN_REFERENCE,
  SUBJECT,
  UCUM,
  VITRONIC,
  VITRONIC_IDENTIFIER
} from './testHelpers';

/**
 * The BodyLoop payload is radians, so the fixture is written in radians. A
 * degree-shaped fixture under a `deg` label is self-consistent and proves
 * nothing, which is how a 57.3x error survived a green suite.
 */
function makeAngle(overrides: Partial<Angle> = {}): Angle {
  return {
    angle_path: 'angle/elbow',
    at_marker: 'marker/at',
    from_marker: 'marker/from',
    to_marker: 'marker/to',
    angles: { primary: Math.PI / 2, supplementary: Math.PI / 2, conjugate: (3 * Math.PI) / 2 },
    preference: null,
    details: {
      at_marker: makeMarker({ marker_path: 'marker/at' }),
      from_marker: makeMarker({ marker_path: 'marker/from' }),
      to_marker: makeMarker({ marker_path: 'marker/to' })
    },
    ...overrides
  };
}

describe('mapAngleToFHIR', () => {
  it('converts the radian payload to degrees and promotes it to valueQuantity', () => {
    const observation = mapAngleToFHIR(makeAngle({ label: 'Elbow angle' }), CONTEXT);

    expect(observation).toMatchObject<Partial<Observation>>({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'exam', display: 'Exam' }] }],
      code: {
        coding: [{ system: VITRONIC, code: 'angle/elbow', display: 'Angle angle/elbow' }],
        text: 'Elbow angle'
      },
      subject: SUBJECT,
      effectiveDateTime: RECORDED_AT,
      valueQuantity: { value: 90, unit: 'degree', system: UCUM, code: 'deg' }
    });
  });

  it('converts a real BodyLoop shoulder angle to 84.8923 degrees, not 1.4817', () => {
    const observation = mapAngleToFHIR(
      makeAngle({
        angles: { primary: 1.4816501199902758, supplementary: 1.6599425335995173, conjugate: 4.801535187189311 }
      }),
      CONTEXT
    );

    expect(observation.valueQuantity).toEqual({ value: 84.8923, unit: 'degree', system: UCUM, code: 'deg' });
  });

  it('emits all three aspects as degree components', () => {
    const observation = mapAngleToFHIR(makeAngle(), CONTEXT);

    expect(observation.component).toEqual([
      {
        code: { coding: [{ system: VITRONIC, code: 'angle/elbow#primary', display: 'Primary angle' }] },
        valueQuantity: { value: 90, unit: 'degree', system: UCUM, code: 'deg' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'angle/elbow#supplementary', display: 'Supplementary angle' }] },
        valueQuantity: { value: 90, unit: 'degree', system: UCUM, code: 'deg' }
      },
      {
        code: { coding: [{ system: VITRONIC, code: 'angle/elbow#conjugate', display: 'Conjugate angle' }] },
        valueQuantity: { value: 270, unit: 'degree', system: UCUM, code: 'deg' }
      }
    ]);
  });

  it('promotes the aspect named by preference, not always the primary angle', () => {
    expect(mapAngleToFHIR(makeAngle({ preference: 'conjugate' }), CONTEXT).valueQuantity?.value).toBe(270);
  });

  it('falls back to the primary angle when preference is null or unrecognised', () => {
    expect(mapAngleToFHIR(makeAngle(), CONTEXT).valueQuantity?.value).toBe(90);
    expect(mapAngleToFHIR(makeAngle({ preference: 'nonsense' }), CONTEXT).valueQuantity?.value).toBe(90);
  });

  it('states the angle is absent rather than publishing a Quantity with no value', () => {
    const observation = mapAngleToFHIR(
      makeAngle({ angles: { primary: Number.NaN, supplementary: 0, conjugate: 0 } }),
      CONTEXT
    );

    expect(observation.valueQuantity).toBeUndefined();
    expect(observation.dataAbsentReason).toEqual({
      coding: [{ system: DATA_ABSENT_REASON, code: 'error', display: 'Error' }]
    });
    expect(observation.component?.[0]?.dataAbsentReason).toBeDefined();
  });

  it('describes the code in coding.display and keeps the operator label in code.text', () => {
    const withLabel = mapAngleToFHIR(makeAngle({ label: 'Elbow angle' }), CONTEXT);
    const withoutLabel = mapAngleToFHIR(makeAngle(), CONTEXT);

    expect(withLabel.code.coding?.[0].display).toBe('Angle angle/elbow');
    expect(withLabel.code.text).toBe('Elbow angle');
    expect(withoutLabel.code.coding?.[0].display).toBe('Angle angle/elbow');
    expect(withoutLabel.code.text).toBeUndefined();
  });

  it('carries a deterministic id and a business identifier so a re-sync updates in place', () => {
    const first = mapAngleToFHIR(makeAngle({ key_external: 'ext-1' }), CONTEXT);
    const second = mapAngleToFHIR(makeAngle({ key_external: 'ext-1' }), CONTEXT);

    expect(first.id).toBe(second.id);
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.identifier).toEqual([
      measurementIdentifierFor('angle', 'angle/elbow'),
      { system: VITRONIC_IDENTIFIER, value: 'external-key/ext-1' }
    ]);
  });

  it('records the scan as provenance and the landmarks it was computed from', () => {
    const observation = mapAngleToFHIR(makeAngle(), CONTEXT);

    expect(observation.derivedFrom).toEqual([
      SCAN_REFERENCE,
      markerReferenceFor('marker/at', 'Vertex marker'),
      markerReferenceFor('marker/from', 'From marker'),
      markerReferenceFor('marker/to', 'To marker')
    ]);
    expect(observation.bodySite).toEqual({ text: 'Marker/at' });
  });

  it('applies common fields (note, hidden and style)', () => {
    const observation = mapAngleToFHIR(makeAngle({ note: 'left arm', hidden: true, style: 'dashed' }), CONTEXT);

    expect(observation.note).toEqual([{ text: 'left arm' }]);
    expect(observation.extension).toEqual([
      { url: 'http://opentwin.ch/fhir/StructureDefinition/vitronic-hidden', valueBoolean: true },
      { url: 'http://opentwin.ch/fhir/StructureDefinition/vitronic-style', valueString: 'dashed' }
    ]);
  });
});

describe('mapAngleListToFHIR', () => {
  it('maps every angle in the list', () => {
    const observations = mapAngleListToFHIR(
      [makeAngle({ angle_path: 'angle/a' }), makeAngle({ angle_path: 'angle/b' })],
      CONTEXT
    );

    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('angle/a');
    expect(observations[1].code.coding?.[0].code).toBe('angle/b');
    expect(observations[0].id).not.toBe(observations[1].id);
  });

  it('returns an empty array for an empty list', () => {
    expect(mapAngleListToFHIR([], CONTEXT)).toEqual([]);
  });
});
