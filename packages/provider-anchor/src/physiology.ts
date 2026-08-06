/**
 * WHAT: Physiologically possible value envelopes for Anchor ingest (fail closed outside).
 * NOT:  Not a reference interval and not a diagnostic cutoff — only impossible-value rejection.
 * GOVERNED BY: docs/contracts/fhir-core.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: These bounds are deliberately wide. Tightening them is a clinical decision, not a silent edit.
 */

/** Inclusive [min, max] in the biomarker's canonical UCUM unit. */
export interface PhysiologicalEnvelope {
  min: number;
  max: number;
}

/**
 * Envelopes keyed by biomarker_id for the marker-class worked examples.
 * Unknown biomarkers have no envelope here — callers must not invent one.
 */
export const PHYSIOLOGICAL_ENVELOPES: Readonly<Record<string, PhysiologicalEnvelope>> = {
  'BM-107': { min: 0.1, max: 10_000 }, // Ferritin ng/mL
  'BM-063': { min: 0.5, max: 5 }, // Calcium mmol/L
  'BM-132': { min: 0, max: 5_000 }, // GPT U/L
  'BM-139': { min: 3, max: 20 }, // HbA1c %
  'BM-426': { min: 0.1, max: 500 }, // Leukocytes 10*9/L
  'BM-064': { min: 0, max: 10_000 }, // Calprotectin ug/g
  'BM-435': { min: 0, max: 100 }, // DPD nmol/mmol
  'BM-001': { min: 0, max: 50_000 }, // Estradiol pmol/L
  'BM-386': { min: 0, max: 200 } // TSH m[IU]/L
};

export function isPhysiologicallyPossible(
  biomarkerId: string,
  value: number
): { ok: true } | { ok: false; envelope: PhysiologicalEnvelope } {
  const envelope = PHYSIOLOGICAL_ENVELOPES[biomarkerId];
  if (!envelope) return { ok: true };
  if (value < envelope.min || value > envelope.max) {
    return { ok: false, envelope };
  }
  return { ok: true };
}
