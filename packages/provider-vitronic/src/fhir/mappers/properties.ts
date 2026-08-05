/**
 * WHAT: Maps one vendor record type into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: signed review record for unitless waiver (verify/units-allowlist.json); not a UCUM invention.
 */
import type { CodeableConcept, Observation, Quantity } from 'fhir/r4';
import type { Property, PropertyList } from '../../api/schemas/properties';
import { createMeasurementObservation, dataAbsentReason, type MeasurementContext } from './shared';

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
    ...resolvePropertyValue(property.value)
  });
}

export function mapPropertyListToFHIR(properties: PropertyList, context: MeasurementContext): Observation[] {
  return properties.map((property) => mapPropertyToFHIR(property, context));
}

/**
 * Missing is never silent. An Observation with neither `value[x]` nor
 * `dataAbsentReason` asserts a property was measured and then states nothing;
 * a non-finite number JSON-serialises to the literal string `"null"`, which
 * reads as a value.
 */
function resolvePropertyValue(value: unknown): PropertyValue {
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
    return Number.isFinite(value) ? { valueQuantity: { value } } : { dataAbsentReason: dataAbsentReason('error') };
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
