import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type ConformanceFixture,
  describeReaderConformance,
  type ExpectedSummary
} from '@open-twin/reader-core/testing';
import { describe, expect, it } from 'vitest';
import { FHIR_R4_DESCRIPTOR, FhirR4Reader } from '../reader';
import { validateFhir } from '../validate/validate';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'synthea');

interface FixturePatient {
  id: string;
  name?: Array<{ family?: string; given?: string[] }>;
}

function patientOf(path: string): FixturePatient {
  const bundle = JSON.parse(readFileSync(path, 'utf8')) as { entry: Array<{ resource: { resourceType: string } }> };
  const patient = bundle.entry.find((e) => e.resource.resourceType === 'Patient')?.resource as
    | FixturePatient
    | undefined;
  if (!patient) throw new Error(`${path}: no Patient`);
  return patient;
}

const names = readdirSync(FIXTURES)
  .filter((name) => /^patient-\d+\.json$/.test(name))
  .sort();

const fixtures: ConformanceFixture[] = names.map((name) => ({
  name,
  input: { kind: 'file', path: join(FIXTURES, name) },
  request: { subjectKey: `synthea-${name.replace('.json', '')}` },
  expected: JSON.parse(readFileSync(join(FIXTURES, name.replace('.json', '.expected.json')), 'utf8')) as ExpectedSummary
}));

/** Names and ids from the synthetic patients: none may reach an issue, the provenance or a log line. */
const secrets = Object.fromEntries(
  names.flatMap((name) => {
    const patient = patientOf(join(FIXTURES, name));
    const family = patient.name?.[0]?.family;
    const given = patient.name?.[0]?.given?.[0];
    return [
      [`${name} patient id`, patient.id],
      ...(family ? [[`${name} family name`, family]] : []),
      ...(given ? [[`${name} given name`, given]] : [])
    ];
  })
);

describeReaderConformance(() => new FhirR4Reader(), {
  descriptor: FHIR_R4_DESCRIPTOR,
  fixtures,
  invalidInput: { kind: 'file', text: '{"resourceType":"Patient","id":"x"}' },
  validate: validateFhir,
  secrets
});

describe('FhirR4Reader beyond the shared suite', () => {
  const first = fixtures[0];
  if (!first) throw new Error('no fixtures');

  it('keeps the bundle Patient as the subject when the caller names none', async () => {
    const reader = new FhirR4Reader();
    await reader.open(first.input, { now: () => '2026-01-01T00:00:00Z' });
    const { bundle, issues } = await reader.read(first.request);
    const patients = (bundle.entry ?? []).filter((e) => e.resource?.resourceType === 'Patient');
    expect(patients).toHaveLength(1);
    expect(patients[0]?.resource).toHaveProperty('name');
    expect(issues.map((i) => i.code)).toContain('subject-from-bundle');
  });

  it('uses the caller reference verbatim, keeps the foreign Patient and says the subject is external', async () => {
    const reader = new FhirR4Reader();
    await reader.open(first.input, { now: () => '2026-01-01T00:00:00Z' });
    const { bundle, issues } = await reader.read({ ...first.request, subject: { reference: 'Patient/caller-42' } });
    const observation = (bundle.entry ?? []).find((e) => e.resource?.resourceType === 'Observation')?.resource;
    expect(observation).toMatchObject({ subject: { reference: 'Patient/caller-42' } });
    expect((bundle.entry ?? []).filter((e) => e.resource?.resourceType === 'Patient')).toHaveLength(1);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('ot-normalised-subject-external');
    expect(codes).not.toContain('subject-from-bundle');
  });

  it('reports a window and an unknown type as issues instead of applying them', async () => {
    const reader = new FhirR4Reader();
    await reader.open(first.input);
    const { issues } = await reader.read({
      ...first.request,
      window: { start: '2020-01-01T00:00:00Z', end: '2020-01-02T00:00:00Z' },
      types: ['bundle', 'observations']
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('window-not-applied');
    expect(codes).toContain('unknown-type');
  });

  it('does not claim a non-bundle or an api input, and rejects text that is not JSON', async () => {
    expect(new FhirR4Reader().isThisType({ kind: 'file', text: '{"resourceType":"Observation"}' })).toBe(false);
    expect(new FhirR4Reader().isThisType({ kind: 'api', sourceId: 'fhir-r4', config: {} })).toBe(false);
    await expect(new FhirR4Reader().open({ kind: 'file', text: '{' })).rejects.toMatchObject({ code: 'validation' });
  });

  it('throws validation at read when the bundle cannot be normalised', async () => {
    const reader = new FhirR4Reader();
    await reader.open({
      kind: 'file',
      text: '{"resourceType":"Bundle","type":"collection","entry":[{"resource":{"resourceType":"Observation"}}]}'
    });
    await expect(reader.read({ subjectKey: 's' })).rejects.toMatchObject({ code: 'validation', operation: 'read' });
  });
});
