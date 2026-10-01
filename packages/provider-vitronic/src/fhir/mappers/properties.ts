/**
 * WHAT: Maps one vendor record type into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
 * GOVERNED BY: DECISIONS.md#d15; DECISIONS.md#d4
 * CORRECTNESS: BodyLoop 0.13.7 property paths (DECISIONS.md#d15); UCUM names via @lhncbc/ucum-lhc; unitless waiver for unknown paths (verify/units-allowlist.json).
 */
import { quantity, UCUM, type UcumUnit } from '@open-twin/fhir-core';
import type { CodeableConcept, Observation, Quantity } from 'fhir/r4';
import type { Property, PropertyList } from '../../api/schemas/properties';
import { createMeasurementObservation, dataAbsentReason, type MeasurementContext } from './shared';

/**
 * Units this connector needs that `@open-twin/fhir-core`'s shared table does not
 * yet carry. Same shape as that table so adopting them upstream is an import change.
 * `m3`: UCUM publishes the name as HTML (`meter<sup>3</sup>`); Quantity.unit cannot
 * carry markup, so the spoken name is recorded as a units-allowlist exception.
 */
export const VT_UCUM = {
  CUBIC_METRE: { unit: 'cubic meter', code: 'm3' },
  KILOGRAM_PER_SQUARE_METRE: { unit: 'kilogram per square meter', code: 'kg/m2' }
} as const;

type PropertyUnit = UcumUnit | (typeof VT_UCUM)[keyof typeof VT_UCUM];

/** D15. Exact `property_path` only — no prefix matching. */
const PROPERTY_UNITS: Record<string, PropertyUnit> = {
  'body.height': UCUM.METRE,
  'body.surface': UCUM.SQUARE_METRE,
  'body.volume': VT_UCUM.CUBIC_METRE,
  'body.mass': UCUM.KILOGRAM,
  'body.bmi': VT_UCUM.KILOGRAM_PER_SQUARE_METRE
};

interface PropertyValue {
  valueQuantity?: Quantity;
  valueBoolean?: boolean;
  valueString?: string;
  dataAbsentReason?: CodeableConcept;
}

export function mapPropertyToFHIR(property: Property, context: MeasurementContext): Observation {
  return createMeasurementObservation({
    context,
    scope: 'properties',
    path: property.property_path,
    common: property,
    display: `Property ${property.property_path}`,
    // A property path is a data key, not an anatomical location.
    bodySitePath: null,
    ...resolvePropertyValue(property.property_path, property.value)
  });
}

export function mapPropertyListToFHIR(properties: PropertyList, context: MeasurementContext): Observation[] {
  return properties.map((property) => mapPropertyToFHIR(property, context));
}

function propertyQuantity(value: number, unit: PropertyUnit): Quantity | undefined {
  return quantity(value, unit as UcumUnit);
}

/**
 * Missing is never silent. An Observation with neither `value[x]` nor
 * `dataAbsentReason` asserts a property was measured and then states nothing;
 * a non-finite number JSON-serialises to the literal string `"null"`, which
 * reads as a value.
 */
function resolvePropertyValue(path: string, value: unknown): PropertyValue {
  if (value === null || value === undefined) {
    return { dataAbsentReason: dataAbsentReason('unknown') };
  }

  if (typeof value === 'boolean') {
    return { valueBoolean: value };
  }

  if (typeof value === 'number') {
    // NaN and Infinity are not FHIR decimals. `not-a-number` is the precise
    // data-absent-reason code; the shared helper offers only the three the rest
    // of the repository uses, and `error` carries the same meaning here.
    if (!Number.isFinite(value)) {
      return { dataAbsentReason: dataAbsentReason('error') };
    }
    const unit = PROPERTY_UNITS[path];
    if (unit) {
      const coded = propertyQuantity(value, unit);
      return coded ? { valueQuantity: coded } : { dataAbsentReason: dataAbsentReason('error') };
    }
    return { valueQuantity: { value } };
  }

  if (typeof value === 'string') {
    const text = value.trim();
    // FHIR strings may not be empty.
    return text.length > 0 ? { valueString: text } : { dataAbsentReason: dataAbsentReason('unknown') };
  }

  try {
    const serialised = JSON.stringify(value);
    if (typeof serialised === 'string' && serialised.length > 0) {
      return { valueString: serialised };
    }
  } catch {
    // Circular or otherwise non-serialisable; fall through.
  }
  return { dataAbsentReason: dataAbsentReason('error') };
}
