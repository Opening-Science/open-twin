import {
  auditMeasurementDeclarations,
  declarationAddress,
  type MeasurementDeclarationSet,
  validateMeasurementDeclarations
} from '@open-twin/fhir-core';
import type { Bundle } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { VITRONIC_MEASUREMENTS } from '..';
import { buildBundleFromVitronicResponse } from '../fhir/bundleBuilder';
import { buildVitronicExemplarBundle } from './fixtures/exemplarBundle';
import { knownPathsResponse, knownProperties } from './fixtures/knownPathsPayload';
import { samplePayload } from './fixtures/samplePayload';

const VITRONIC = 'http://opentwin.ch/fhir/CodeSystem/vitronic';

/**
 * The shipped set is `open` because BodyLoop paths are scanner-chosen. Auditing
 * the known-path payload as `complete` turns every undeclared value back into a
 * failure, which is the guard this file exists for.
 */
const STRICT: MeasurementDeclarationSet = { ...VITRONIC_MEASUREMENTS, coverage: 'complete' };

function knownBundle(): Bundle {
  return buildBundleFromVitronicResponse(knownPathsResponse());
}

describe('VITRONIC_MEASUREMENTS', () => {
  it('is internally consistent with the shared definitions', () => {
    expect(validateMeasurementDeclarations(VITRONIC_MEASUREMENTS)).toEqual([]);
  });

  it('declares open coverage: the codes are scanner-chosen paths with no closed list', () => {
    expect(VITRONIC_MEASUREMENTS.connector).toBe('vitronic');
    expect(VITRONIC_MEASUREMENTS.coverage).toBe('open');
  });

  it('declares only vendor-local codings', () => {
    const systems = new Set(
      VITRONIC_MEASUREMENTS.declarations.flatMap((declaration) => [
        declaration.coding.system,
        ...(declaration.location.kind === 'component' ? [declaration.location.parent.system] : [])
      ])
    );
    expect([...systems]).toEqual([VITRONIC]);
  });

  it('matches every value the mappers emit for the known paths, and every declaration is exercised', () => {
    const audit = auditMeasurementDeclarations(STRICT, knownBundle());

    expect(audit.issues).toEqual([]);
    expect(audit.unexercised).toEqual([]);
  });

  it('pins the angle unit to degrees, matching the radians conversion (D10)', () => {
    const angle = VITRONIC_MEASUREMENTS.declarations.filter((declaration) =>
      declaration.key.startsWith('vitronic:angle.')
    );
    expect(angle).toHaveLength(8);
    expect(new Set(angle.map((declaration) => declaration.unit))).toEqual(new Set(['deg']));
  });

  it('declares the five D15 property paths with their SI units and nothing else', () => {
    const properties = VITRONIC_MEASUREMENTS.declarations
      .filter((declaration) => declaration.key.startsWith('vitronic:property.'))
      .map((declaration) => [declaration.coding.code, declaration.unit]);
    expect(properties).toEqual([
      ['body.height', 'm'],
      ['body.surface', 'm2'],
      ['body.volume', 'm3'],
      ['body.mass', 'kg'],
      ['body.bmi', 'kg/m2']
    ]);
  });

  it('leaves undeclared exactly the exemplar paths that were composed rather than recorded', () => {
    const bundle = buildVitronicExemplarBundle();

    // As shipped (`open`), forwarded vendor paths are not issues.
    expect(auditMeasurementDeclarations(VITRONIC_MEASUREMENTS, bundle).issues).toEqual([]);

    // Strictly, the only gaps are these, each a path no recorded payload or
    // decision documents, so declaring it would be a guess:
    // - stature.vertex.M: the exemplar's height_path; no height_path is recorded.
    // - scan.software_version, body.mass_index, body.weight_source: composed
    //   property paths outside D15, whose value type and unit are unknown.
    const undeclared = auditMeasurementDeclarations(STRICT, bundle).issues.map((issue) => [
      issue.code,
      issue.location,
      issue.codings
    ]);
    expect(undeclared).toEqual([
      ['undeclared', 'observation', [`${VITRONIC}|stature.vertex.M`]],
      ['undeclared', 'observation', [`${VITRONIC}|scan.software_version`]],
      ['undeclared', 'observation', [`${VITRONIC}|body.mass_index`]],
      ['undeclared', 'observation', [`${VITRONIC}|body.weight_source`]]
    ]);
  });

  describe('optional fields', () => {
    it('accepts a cross-section without areas, which omits the area components', () => {
      const [crossSection] = samplePayload('cross_section');
      if (!crossSection) throw new Error('fixture has no cross-section');
      const bundle = buildBundleFromVitronicResponse({
        scan_id: '4711',
        cross_section: [{ ...crossSection, areas: undefined, preference: 'perimeter' }]
      });

      expect(auditMeasurementDeclarations(STRICT, bundle).issues).toEqual([]);
    });

    it('accepts a marker without a surface normal and non-default preferences', () => {
      const response = knownPathsResponse();
      const bundle = buildBundleFromVitronicResponse({
        ...response,
        angle: response.angle?.map((angle) => ({ ...angle, preference: 'conjugate' })),
        distance: response.distance?.map((distance) => ({ ...distance, preference: 'x' })),
        marker: response.marker?.map((marker) => ({ ...marker, normal: null }))
      });

      expect(auditMeasurementDeclarations(STRICT, bundle).issues).toEqual([]);
    });

    it('accepts a missing or non-finite D15 property as absence, never a value', () => {
      const bundle = buildBundleFromVitronicResponse({
        scan_id: '4711',
        properties: knownProperties().map((property, index) => ({
          ...property,
          value: index % 2 === 0 ? null : Number.NaN
        }))
      });

      expect(auditMeasurementDeclarations(STRICT, bundle).issues).toEqual([]);
    });
  });

  describe('negative cases', () => {
    it('reports an emitted component whose declaration was removed', () => {
      const stripped: MeasurementDeclarationSet = {
        ...STRICT,
        declarations: STRICT.declarations.filter(
          (declaration) => declaration.key !== 'vitronic:angle.arm.shoulder.r.primary'
        )
      };

      const audit = auditMeasurementDeclarations(stripped, knownBundle());

      expect(audit.issues).toEqual([
        expect.objectContaining({
          code: 'undeclared',
          location: 'component',
          codings: [`${VITRONIC}|arm.shoulder.R#primary`]
        })
      ]);
    });

    it('reports a declaration whose unit disagrees with the emitted degrees', () => {
      const asRadians: MeasurementDeclarationSet = {
        ...STRICT,
        declarations: STRICT.declarations.map((declaration) =>
          declaration.key === 'vitronic:angle.arm.shoulder.r' ? { ...declaration, unit: 'rad' } : declaration
        )
      };

      const audit = auditMeasurementDeclarations(asRadians, knownBundle());

      expect(audit.issues).toEqual([
        expect.objectContaining({
          code: 'unit-mismatch',
          location: 'observation',
          codings: [`${VITRONIC}|arm.shoulder.R`]
        })
      ]);
    });

    it('reports a D15 property the scanner sends as text instead of a number', () => {
      const bundle = buildBundleFromVitronicResponse({
        scan_id: '4711',
        properties: knownProperties().map((property) =>
          property.property_path === 'body.mass' ? { ...property, value: 'seventy-one' } : property
        )
      });

      const audit = auditMeasurementDeclarations(STRICT, bundle);

      expect(audit.issues).toEqual([
        expect.objectContaining({
          code: 'value-type-mismatch',
          location: 'observation',
          codings: [`${VITRONIC}|body.mass`]
        })
      ]);
    });

    it('reports a scanner path outside the known set when audited strictly', () => {
      const [height] = samplePayload('height');
      if (!height) throw new Error('fixture has no height');
      const bundle = buildBundleFromVitronicResponse({ scan_id: '4711', height: [height] });

      expect(auditMeasurementDeclarations(STRICT, bundle).issues.map((issue) => issue.code)).toEqual(['undeclared']);
      expect(auditMeasurementDeclarations(VITRONIC_MEASUREMENTS, bundle).issues).toEqual([]);
    });
  });

  it('counts each declared value once per emitted value', () => {
    const audit = auditMeasurementDeclarations(STRICT, knownBundle());
    const counts = new Set(
      STRICT.declarations.map((declaration) => audit.matches.get(declarationAddress(declaration)))
    );
    expect(counts).toEqual(new Set([1]));
  });
});
