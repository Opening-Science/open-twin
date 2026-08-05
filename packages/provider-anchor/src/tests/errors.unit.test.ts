/**
 * WHAT: Typed failures for unknown code, unit incommensurable, physiologically impossible; null interval is not an error.
 * NOT:  Does not invent codes or silent pass-through of bad units.
 * GOVERNED BY: DECISIONS.md#d11; D-a
 * CORRECTNESS: LOINC_UNITS / Anchor artefact; NONE for physiological envelopes — see docs/findings/no-external-authority.md
 */
import { describe, expect, it } from 'vitest';
import type { CollectionContext } from '../context.js';
import { AnchorIngestError } from '../errors.js';
import { mapBiomarkerToObservation } from '../fhir/mapObservation.js';

const CTX: CollectionContext = {
  subjectKey: 'error-subject',
  sex: 'male',
  birthDate: '1980-01-01',
  effectiveDateTime: '2026-07-12T09:00:00+02:00',
  collectionEventId: 'error-draw'
};

describe('AnchorIngestError', () => {
  it('rejects an unknown biomarker_id', () => {
    expect(() =>
      mapBiomarkerToObservation(
        {
          biomarker_id: 'BM-NOPE',
          value: 1,
          unit_ucum: 'ng/mL',
          reference_interval_id: null
        },
        CTX
      )
    ).toThrow(AnchorIngestError);
    try {
      mapBiomarkerToObservation(
        {
          biomarker_id: 'BM-NOPE',
          value: 1,
          unit_ucum: 'ng/mL',
          reference_interval_id: null
        },
        CTX
      );
    } catch (e) {
      expect(e).toBeInstanceOf(AnchorIngestError);
      expect((e as AnchorIngestError).code).toBe('unknown_code');
    }
  });

  it('rejects a mass unit against a molar LOINC (Calcium)', () => {
    expect(() =>
      mapBiomarkerToObservation(
        {
          biomarker_id: 'BM-063',
          value: 2.3,
          unit_ucum: 'mg/dL',
          reference_interval_id: null
        },
        CTX
      )
    ).toThrow(/incommensurable/);
    try {
      mapBiomarkerToObservation(
        {
          biomarker_id: 'BM-063',
          value: 2.3,
          unit_ucum: 'mg/dL',
          reference_interval_id: null
        },
        CTX
      );
    } catch (e) {
      expect((e as AnchorIngestError).code).toBe('unit_incommensurable');
    }
  });

  it('rejects a physiologically impossible value', () => {
    try {
      mapBiomarkerToObservation(
        {
          biomarker_id: 'BM-139',
          value: 80,
          unit_ucum: '%',
          reference_interval_id: null
        },
        CTX
      );
      expect.fail('should throw');
    } catch (e) {
      expect((e as AnchorIngestError).code).toBe('physiologically_impossible');
    }
  });

  it('treats a missing interval as null — Observation has no referenceRange', () => {
    const obs = mapBiomarkerToObservation(
      {
        biomarker_id: 'BM-426',
        value: 6.2,
        unit_ucum: '10*9/L',
        reference_interval_id: null
      },
      CTX
    );
    expect(obs.referenceRange).toBeUndefined();
    expect(obs.valueQuantity?.value).toBe(6.2);
  });

  it('rejects an interpretive_band id used as a measured reference_interval (D-c)', () => {
    try {
      mapBiomarkerToObservation(
        {
          biomarker_id: 'BM-190',
          value: 140,
          unit_ucum: 'mg/dL',
          reference_interval_id: 'RI-079'
        },
        CTX
      );
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AnchorIngestError);
      expect((e as AnchorIngestError).code).toBe('interpretive_band_not_reference_interval');
    }
  });
});
