/**
 * WHAT: LOINC-property ↔ UCUM commensurability checks for Anchor biomarker ingest.
 * NOT:  Does not convert between mass and molar; incommensurable units fail closed.
 * GOVERNED BY: docs/adr/0004-one-unit-per-concept.md; DECISIONS.md#d11
 * CORRECTNESS: UCUM grammar via LOINC_UNITS table; LOINC FSN property text from Anchor artefact
 */
import { LOINC_UNITS, type UcumUnit } from '@open-twin/fhir-core';

export type LoincPropertyClass =
  | 'mass_volume'
  | 'moles_volume'
  | 'enzymatic_activity_volume'
  | 'number_volume'
  | 'mass_mass'
  | 'molar_ratio'
  | 'units_volume'
  | 'mass_fraction'
  | 'other';

export function loincPropertyClass(loincDisplay: string): LoincPropertyClass {
  if (/\[Moles\/volume\]/i.test(loincDisplay)) return 'moles_volume';
  if (/\[Mass\/volume\]/i.test(loincDisplay)) return 'mass_volume';
  if (/\[Enzymatic activity\/volume\]/i.test(loincDisplay)) {
    return 'enzymatic_activity_volume';
  }
  if (/\[#\/volume\]/i.test(loincDisplay)) return 'number_volume';
  if (/\[Mass\/mass\]/i.test(loincDisplay)) return 'mass_mass';
  if (/\[Molar ratio\]/i.test(loincDisplay) || /\/Creatinine/i.test(loincDisplay)) {
    return 'molar_ratio';
  }
  if (/\[Units\/volume\]/i.test(loincDisplay)) return 'units_volume';
  // 4548-4 has no bracket property in the short name; it is a mass fraction as %.
  if (/A1c|Mass fraction/i.test(loincDisplay)) return 'mass_fraction';
  return 'other';
}

const PROPERTY_UNITS: Record<LoincPropertyClass, ReadonlySet<string>> = {
  mass_volume: new Set(['ng/mL', 'ug/L', 'mg/dL', 'g/L', 'pg/mL']),
  moles_volume: new Set(['mmol/L', 'pmol/L', 'nmol/L', 'umol/L']),
  enzymatic_activity_volume: new Set(['U/L']),
  number_volume: new Set(['10*9/L', '10*12/L', '/uL', '10*3/uL']),
  mass_mass: new Set(['ug/g', 'mg/g']),
  molar_ratio: new Set(['nmol/mmol', 'umol/mol', 'mmol/mol']),
  units_volume: new Set(['m[IU]/L', '[IU]/L', 'u[IU]/mL']),
  mass_fraction: new Set(['%']),
  other: new Set(),
};

/** True when unit_ucum is dimensionally compatible with the LOINC FSN property. */
export function unitCommensurableWithLoinc(
  loincDisplay: string,
  unitUcum: string,
  loincCode?: string,
): boolean {
  const canonical = loincCode ? LOINC_UNITS[loincCode] : undefined;
  if (canonical) {
    return canonical.code === unitUcum;
  }
  const prop = loincPropertyClass(loincDisplay);
  const allowed = PROPERTY_UNITS[prop];
  if (prop === 'other') return false;
  return allowed.has(unitUcum);
}

export function resolveUcumUnit(loincCode: string, unitUcum: string): UcumUnit | undefined {
  const canonical = LOINC_UNITS[loincCode];
  if (!canonical) return undefined;
  if (canonical.code !== unitUcum) return undefined;
  return canonical;
}
