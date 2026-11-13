import {
  auditMeasurementDeclarations,
  declareMeasurement,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  SYSTEMS,
  UCUM,
  validateMeasurementDeclarations
} from '@open-twin/fhir-core';
import type { Bundle, Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { convertMessage } from '../fhir/bundleBuilder';
import { HL7V2_MEASUREMENTS } from '../fhir/measurements';
import { HL7V2_LOCAL_SYSTEM, resolveCodingSystem } from '../v2/tables';
import { ADT_A01, MDM_T02_OBX, message, ORU_R01 } from './fixtures/messages';

const TIMESTAMP = '2026-07-26T10:00:00Z';
const CR = '\r';

/**
 * The IG's ORU_R01 with the IG's MDM_T02 OBX segments (local and unstated coding
 * systems, a LOINC alternate) appended, plus two synthetic OBX: a local code with a
 * coded value, and an OBX-3 that is empty. MDM itself is refused by this connector,
 * so its OBX segments are carried in an ORU here. The local codes are illustrative.
 */
const ORU_WITH_LOCAL_CODES = message(
  ...ORU_R01.split(CR),
  ...MDM_T02_OBX,
  'OBX|5|CWE|SYN-1^Synthetic local result^99ZZZ||POS^Positive^99ZZZ||||||F',
  'OBX|6|ST|||free text result||||||F'
);

interface Converted {
  raw: string;
  bundle: Bundle;
}

/** Every fixture, converted through the connector's public entry point. */
function converted(): Converted[] {
  return [ORU_R01, ADT_A01, ORU_WITH_LOCAL_CODES].map((raw) => ({
    raw,
    bundle: convertMessage(raw, { timestamp: TIMESTAMP }).bundle
  }));
}

function observations(bundle: Bundle): Observation[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is Observation => resource?.resourceType === 'Observation');
}

/**
 * The tokens of every OBX-3 in the raw message, split on the component and
 * subcomponent separators without using this package's parser — so a coding the
 * mapper minted cannot hide behind the same code that produced it.
 */
function obx3Tokens(raw: string): Set<string> {
  return new Set(
    raw
      .split(CR)
      .filter((segment) => segment.startsWith('OBX|'))
      .flatMap((segment) => (segment.split('|')[3] ?? '').split(/[\^&]/))
      .filter((token) => token.length > 0)
  );
}

describe('HL7V2_MEASUREMENTS', () => {
  it('is internally consistent with the shared definitions', () => {
    expect(validateMeasurementDeclarations(HL7V2_MEASUREMENTS)).toEqual([]);
  });

  it('is open and declares nothing, because the connector mints no Observation code', () => {
    expect(HL7V2_MEASUREMENTS.coverage).toBe('open');
    expect(HL7V2_MEASUREMENTS.definitions).toEqual([]);
    expect(HL7V2_MEASUREMENTS.declarations).toEqual([]);
  });

  it('declares the connector this package tags its bundles with', () => {
    const [first] = converted();
    expect(first?.bundle.meta?.tag?.map((tag) => tag.code)).toContain(HL7V2_MEASUREMENTS.connector);
  });

  it('audits every fixture without issues', () => {
    for (const { bundle } of converted()) {
      expect(observations(bundle).length).toBeGreaterThan(0);
      const audit = auditMeasurementDeclarations(HL7V2_MEASUREMENTS, bundle);
      expect(audit.issues).toEqual([]);
      expect(audit.unexercised).toEqual([]);
    }
  });

  it('emits only Observation codings taken from the message, so it has nothing of its own to declare', () => {
    for (const { raw, bundle } of converted()) {
      const tokens = obx3Tokens(raw);
      const systems = new Set([
        HL7V2_LOCAL_SYSTEM,
        ...[...tokens].map((t) => resolveCodingSystem(t, HL7V2_LOCAL_SYSTEM).system)
      ]);
      for (const observation of observations(bundle)) {
        // The OBX[Observation-Component] map is not implemented, so no component is minted.
        expect(observation.component).toBeUndefined();
        for (const coding of observation.code.coding ?? []) {
          expect(tokens.has(coding.code ?? '')).toBe(true);
          expect(systems.has(coding.system ?? '')).toBe(true);
        }
      }
    }
  });

  it('forwards a local code verbatim under the local system', () => {
    const bundle = convertMessage(ORU_WITH_LOCAL_CODES, { timestamp: TIMESTAMP }).bundle;
    const codings = observations(bundle).flatMap((observation) => observation.code.coding ?? []);
    expect(codings).toContainEqual(expect.objectContaining({ system: HL7V2_LOCAL_SYSTEM, code: 'SYN-1' }));
    // The empty OBX-3 yields an Observation with text and no coding at all.
    expect(observations(bundle).some((observation) => observation.code.coding === undefined)).toBe(true);
  });

  it('reports every Observation as undeclared if the set claimed complete coverage', () => {
    // Proves the forwarded codes really are emitted and only `open` coverage tolerates them.
    const complete: MeasurementDeclarationSet = { ...HL7V2_MEASUREMENTS, coverage: 'complete' };
    for (const { bundle } of converted()) {
      const audit = auditMeasurementDeclarations(complete, bundle);
      expect(audit.issues).toHaveLength(observations(bundle).length);
      expect(audit.issues.every((issue) => issue.code === 'undeclared')).toBe(true);
    }
  });

  it('catches a mis-declared value in this connector’s output', () => {
    // A test-only declaration for the ADT_A01 body height, which arrives as `190 cm`.
    const bodyHeight: MeasurementDefinition = {
      key: 'hl7v2:test.body-height',
      description: 'Test-only: body height declared in the wrong unit.',
      valueType: 'quantity',
      canonicalUnit: UCUM.METRE.code,
      context: { scope: 'reading' }
    };
    const set: MeasurementDeclarationSet = {
      ...HL7V2_MEASUREMENTS,
      definitions: [bodyHeight],
      declarations: [declareMeasurement(bodyHeight, { system: SYSTEMS.LOINC, code: '8302-2' })]
    };
    const audit = auditMeasurementDeclarations(set, convertMessage(ADT_A01, { timestamp: TIMESTAMP }).bundle);
    expect(audit.issues.map((issue) => issue.code)).toEqual(['unit-mismatch']);
  });
});
