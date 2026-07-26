import { SYSTEMS } from '@open-twin/fhir-core';
import { describe, expect, it } from 'vitest';
import { validateFhir } from '../validate/validate';
import { INVALID_FIXTURES, VALID_BASELINE } from './fixtures/invalid-bundles';

describe('validateFhir', () => {
  it('reports nothing above information on the conformant baseline', () => {
    const result = validateFhir(VALID_BASELINE);
    expect(result.issues.filter((issue) => issue.severity !== 'information')).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it.each(INVALID_FIXTURES)('flags $name: $defect', (fixture) => {
    const result = validateFhir(fixture.bundle);
    const found = result.issues.filter((issue) => issue.rule === fixture.rule);

    expect(found.length).toBeGreaterThan(0);
    expect(found.map((issue) => issue.severity)).toContain(fixture.severity);
    expect(result.ok).toBe(fixture.severity !== 'error' && fixture.severity !== 'fatal');
  });

  it('locates every finding with a FHIRPath expression', () => {
    for (const fixture of INVALID_FIXTURES) {
      for (const issue of validateFhir(fixture.bundle).issues) {
        expect(issue.expression, `${fixture.name} / ${issue.rule}`).toMatch(/^[A-Z][A-Za-z]+(\.|\[|$)/);
      }
    }
  });

  describe('never throws, whatever it is handed', () => {
    const garbage: Array<[string, unknown]> = [
      ['null', null],
      ['undefined', undefined],
      ['a number', 42],
      ['a string', 'Observation'],
      ['an array', [{ resourceType: 'Observation' }]],
      ['an empty object', {}],
      ['a resourceType that is not a string', { resourceType: 7 }],
      ['a resource type that does not exist', { resourceType: 'Scan' }],
      ['a Bundle whose entry is not an array', { resourceType: 'Bundle', type: 'collection', entry: 'nope' }],
      ['a Bundle of nulls', { resourceType: 'Bundle', type: 'collection', entry: [null, null] }],
      ['a Bundle type that is not in the value set', { resourceType: 'Bundle', type: 'whatever' }]
    ];

    it.each(garbage)('%s', (_label, input) => {
      const result = validateFhir(input);
      expect(result.outcome.resourceType).toBe('OperationOutcome');
      expect(result.outcome.issue.length).toBeGreaterThan(0);
    });
  });

  it('produces an OperationOutcome with at least one issue even when clean', () => {
    // OperationOutcome.issue is 1..*, so an empty list would not be a valid resource.
    const outcome = validateFhir(VALID_BASELINE).outcome;
    expect(outcome.issue).toHaveLength(1);
    expect(outcome.issue[0]?.severity).toBe('information');
  });

  it('carries the rule id and the expression through to the OperationOutcome', () => {
    const fixture = INVALID_FIXTURES.find((item) => item.name === 'obs-6-value-and-data-absent-reason');
    const outcome = validateFhir(fixture?.bundle).outcome;
    const obs6 = outcome.issue.find((item) => item.diagnostics === 'obs-6');

    expect(obs6?.severity).toBe('error');
    expect(obs6?.code).toBe('invariant');
    expect(obs6?.expression).toEqual(['Bundle.entry[1].resource.dataAbsentReason']);
  });

  /**
   * The one test in this file that is about safety rather than correctness.
   *
   * A validation report is the artefact that ends up in a log, a CI annotation or a
   * ticket, and this package validates other people's records. Every value in the
   * bundle below is a distinctive marker; none of them may appear anywhere in the
   * report, in a message, in an expression or in the OperationOutcome.
   */
  it('never copies a value from the input into the report', () => {
    const markers = [
      'MARKER-PATIENT-NAME-8831',
      'MARKER-IDENTIFIER-4417',
      'MARKER-NARRATIVE-9002',
      'MARKER-UNIT-7734',
      'MARKER-FULLURL-2266',
      // A key rather than a value. `validateFhir` accepts `unknown`, so a key is an
      // element name only by convention, and a path built by concatenating keys is a
      // way of copying input into the report through the one channel that is allowed
      // to carry structure.
      'MARKER KEY 6043'
    ];

    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          fullUrl: `urn:uuid:${markers[4]}`,
          resource: {
            resourceType: 'Observation',
            id: 'x',
            identifier: [{ system: 'https://example.org/ids', value: markers[1] }],
            text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${markers[2]}</div>` },
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }], text: markers[0] },
            subject: { display: markers[0] },
            valueQuantity: { value: 62, unit: markers[3], system: 'http://unitsofmeasure.org', code: markers[3] },
            dataAbsentReason: { coding: [{ code: 'unknown' }] },
            [`${markers[5]}`]: { value: 1, system: 'http://unitsofmeasure.org', code: 'not-a-ucum-code' }
          }
        }
      ]
    };

    const result = validateFhir(bundle);
    // The bundle is broken in several ways at once, so the report is not empty.
    expect(result.ok).toBe(false);

    const serialised = JSON.stringify({ issues: result.issues, outcome: result.outcome });
    for (const marker of markers) {
      expect(serialised, `leaked ${marker}`).not.toContain(marker);
    }

    // Elided rather than dropped: the finding is still reported, and still located.
    expect(result.issues.map((item) => item.expression)).toContain('Bundle.entry[0].resource.<redacted>.code');
  });

  /**
   * The exceptions inside the rules, which a fixture that simply breaks something
   * cannot reach. Each of these is a branch that says "this looks wrong and is not",
   * and a branch nothing exercises is a branch nobody has checked.
   */
  describe('the clauses that let something through', () => {
    const observation = (overrides: Record<string, unknown> = {}) => ({
      resourceType: 'Observation',
      id: 'hr1',
      status: 'final',
      code: { coding: [{ system: SYSTEMS.LOINC, code: '8867-4' }] },
      valueQuantity: { value: 62, unit: 'per minute', system: SYSTEMS.UCUM, code: '/min' },
      ...overrides
    });

    it('bdl-7 permits a shared fullUrl when meta.versionId distinguishes the entries', () => {
      const shared = 'urn:uuid:7f5c1a0e-4d63-4a2b-9c18-8e3b6f4a1d92';
      const versioned = (versionId: string) => ({
        fullUrl: shared,
        resource: observation({ meta: { versionId } })
      });

      // The invariant is "unique in a bundle, or else entries with the same fullUrl
      // must have different meta.versionId". Both halves have to hold.
      expect(
        validateFhir({
          resourceType: 'Bundle',
          type: 'collection',
          entry: [versioned('1'), versioned('2')]
        }).issues.map((issue) => issue.rule)
      ).not.toContain('bdl-7');
      expect(
        validateFhir({
          resourceType: 'Bundle',
          type: 'collection',
          entry: [versioned('1'), versioned('1')]
        }).issues.map((issue) => issue.rule)
      ).toContain('bdl-7');
    });

    it('resolves a Type/id reference against Resource.id when the fullUrl is a urn', () => {
      // A receiver will accept either address, so a validator that only indexed the
      // fullUrl would manufacture a failure on a perfectly resolvable bundle.
      const bundle = (patientFullUrl: string) => ({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          { fullUrl: patientFullUrl, resource: { resourceType: 'Patient', id: 'pat2' } },
          {
            fullUrl: 'urn:uuid:7f5c1a0e-4d63-4a2b-9c18-8e3b6f4a1d92',
            resource: observation({ subject: { reference: 'Patient/pat2' } })
          }
        ]
      });

      expect(
        validateFhir(bundle('urn:uuid:2b90dd2b-1a3f-4c5e-9a71-6d0a1f2e3b40')).issues.map((issue) => issue.rule)
      ).not.toContain('ot-reference-external');
      // The same bundle with a Patient that is genuinely not there.
      expect(
        validateFhir({
          resourceType: 'Bundle',
          type: 'collection',
          entry: [
            {
              fullUrl: 'urn:uuid:7f5c1a0e-4d63-4a2b-9c18-8e3b6f4a1d92',
              resource: observation({ subject: { reference: 'Patient/pat2' } })
            }
          ]
        }).issues.map((issue) => issue.rule)
      ).toContain('ot-reference-external');
    });
  });

  it('turns unit checking off when asked, and leaves structure checking on', () => {
    const fixture = INVALID_FIXTURES.find((item) => item.name === 'ucum-bare-steps');
    expect(validateFhir(fixture?.bundle, { units: false }).issues.some((i) => i.rule === 'ot-ucum-invalid')).toBe(
      false
    );
    expect(validateFhir(fixture?.bundle, { units: true }).issues.some((i) => i.rule === 'ot-ucum-invalid')).toBe(true);
  });
});
