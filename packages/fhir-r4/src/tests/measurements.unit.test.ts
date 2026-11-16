import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditMeasurementDeclarations,
  declareMeasurement,
  type MeasurementDeclarationSet,
  type MeasurementDefinition,
  SYSTEMS,
  validateMeasurementDeclarations
} from '@open-twin/fhir-core';
import type { Bundle, FhirResource, Observation } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { FHIR_R4_MEASUREMENTS } from '../measurements';
import { normaliseBundle } from '../normalise/normalise';
import { HL7_BODY_HEIGHT_BUNDLE } from '../samples/hl7-body-height-bundle';
import { HL7_LIPIDS_BUNDLE } from '../samples/hl7-lipids-bundle';
import { HL7_VITALS_BUNDLE } from '../samples/hl7-vitals-bundle';
import { fhirR4IngestBundle } from '../verification/exampleBundle';

const CONNECTOR = { connector: FHIR_R4_MEASUREMENTS.connector, version: '0.1.0' };
const SYNTHEA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/synthea');
const SENDER_LOCAL = 'http://example.org/fhir/CodeSystem/sender-local';

/**
 * None of the committed foreign inputs carries a component, so this synthetic one
 * does: a value-less panel with a Quantity and a string component. Every code is in
 * an illustrative sender-local system, because what is under test is that the
 * normaliser forwards components untouched — not what any standard code means.
 */
const SENDER_PANEL_BUNDLE: Bundle<FhirResource> = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      fullUrl: 'https://sender.example.org/fhir/Observation/panel-1',
      resource: {
        resourceType: 'Observation',
        id: 'panel-1',
        status: 'final',
        code: { coding: [{ system: SENDER_LOCAL, code: 'panel' }] },
        subject: { reference: 'Patient/example' },
        effectiveDateTime: '2026-07-26',
        component: [
          {
            code: { coding: [{ system: SENDER_LOCAL, code: 'reading-a' }] },
            valueQuantity: { value: 12, unit: 'mm', system: SYSTEMS.UCUM, code: 'mm' }
          },
          { code: { coding: [{ system: SENDER_LOCAL, code: 'reading-b' }] }, valueString: 'synthetic' }
        ]
      }
    }
  ]
};

interface Case {
  name: string;
  input: Bundle;
  output: Bundle;
}

function normalise(name: string, input: unknown): Case {
  const result = normaliseBundle(input, {
    connector: CONNECTOR,
    subjectKey: `subject-${name}`,
    timestamp: '2026-07-26T10:00:00Z',
    bundleKey: name,
    // Synthea output carries urn references to resources outside the excerpt.
    unresolvedUrnPolicy: 'preserve'
  });
  if (!result.bundle) throw new Error(`${name}: normalisation refused: ${result.issues.map((i) => i.rule).join(', ')}`);
  return { name, input: input as Bundle, output: result.bundle };
}

/** Every committed foreign input, through the connector's real entry point. */
function cases(): Case[] {
  const synthea = readdirSync(SYNTHEA_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => normalise(file, JSON.parse(readFileSync(join(SYNTHEA_DIR, file), 'utf8'))));
  return [
    normalise('hl7-vitals', HL7_VITALS_BUNDLE),
    normalise('hl7-lipids', HL7_LIPIDS_BUNDLE),
    normalise('hl7-body-height', HL7_BODY_HEIGHT_BUNDLE),
    normalise('sender-panel', SENDER_PANEL_BUNDLE),
    ...synthea
  ];
}

function observations(bundle: Bundle): Observation[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is Observation => resource?.resourceType === 'Observation');
}

/** Every `system|code` pair anywhere in an Observation except `meta`, where the connector tag lives. */
function codingsIn(observation: Observation): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record.system === 'string' && typeof record.code === 'string') {
      found.add(`${record.system}|${record.code}`);
    }
    for (const value of Object.values(record)) walk(value);
  };
  const { meta: _meta, ...rest } = observation;
  walk(rest);
  return found;
}

describe('FHIR_R4_MEASUREMENTS', () => {
  it('is internally consistent with the shared definitions', () => {
    expect(validateMeasurementDeclarations(FHIR_R4_MEASUREMENTS)).toEqual([]);
  });

  it('is open and declares nothing, because the connector mints no Observation code', () => {
    expect(FHIR_R4_MEASUREMENTS.coverage).toBe('open');
    expect(FHIR_R4_MEASUREMENTS.definitions).toEqual([]);
    expect(FHIR_R4_MEASUREMENTS.declarations).toEqual([]);
  });

  it('names the connector the verification bundle is tagged with', () => {
    expect(fhirR4IngestBundle().meta?.tag?.map((tag) => tag.code)).toContain(FHIR_R4_MEASUREMENTS.connector);
  });

  it('audits every normalised fixture without issues', () => {
    const all = cases();
    expect(all.flatMap(({ output }) => observations(output)).some((o) => (o.component ?? []).length > 0)).toBe(true);
    for (const { output } of all) {
      expect(observations(output).length).toBeGreaterThan(0);
      const audit = auditMeasurementDeclarations(FHIR_R4_MEASUREMENTS, output);
      expect(audit.issues).toEqual([]);
      expect(audit.unexercised).toEqual([]);
    }
  });

  it('emits only codings the input carried, so it has nothing of its own to declare', () => {
    for (const { name, input, output } of cases()) {
      const sent = observations(input);
      const emitted = observations(output);
      expect(emitted.length, name).toBe(sent.length);
      emitted.forEach((observation, index) => {
        const source = sent[index] as Observation;
        expect(observation.code, name).toEqual(source.code);
        expect(
          observation.component?.map((component) => component.code),
          name
        ).toEqual(source.component?.map((component) => component.code));
        const original = codingsIn(source);
        for (const coding of codingsIn(observation)) expect(original.has(coding), `${name}: ${coding}`).toBe(true);
      });
    }
  });

  it('reports every Observation as undeclared if the set claimed complete coverage', () => {
    // Proves the forwarded codes really are emitted and only `open` coverage tolerates them.
    const complete: MeasurementDeclarationSet = { ...FHIR_R4_MEASUREMENTS, coverage: 'complete' };
    const output = fhirR4IngestBundle();
    const audit = auditMeasurementDeclarations(complete, output);
    expect(audit.issues.length).toBeGreaterThanOrEqual(observations(output).length);
    expect(audit.issues.every((issue) => issue.code === 'undeclared')).toBe(true);
  });

  it('catches a mis-declared value in this connector’s output', () => {
    // A test-only declaration for the HL7 body-height example, which carries a Quantity.
    const [height] = observations(normalise('hl7-body-height', HL7_BODY_HEIGHT_BUNDLE).output);
    const loinc = height?.code.coding?.find((coding) => coding.system === SYSTEMS.LOINC)?.code;
    expect(loinc).toBeDefined();
    const misdeclared: MeasurementDefinition = {
      key: 'fhir-r4:test.body-height',
      description: 'Test-only: a quantity declared as a string.',
      valueType: 'string',
      context: { scope: 'reading' }
    };
    const set: MeasurementDeclarationSet = {
      ...FHIR_R4_MEASUREMENTS,
      definitions: [misdeclared],
      declarations: [declareMeasurement(misdeclared, { system: SYSTEMS.LOINC, code: loinc as string })]
    };
    const audit = auditMeasurementDeclarations(set, [height as Observation]);
    expect(audit.issues.map((issue) => issue.code)).toEqual(['value-type-mismatch']);
  });
});
