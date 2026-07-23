import type { Observation } from 'fhir/r4';
import type { Property, PropertyList } from '../../api/schemas/properties';
import { applyCommonFields, CATEGORY, createObservation, SYSTEMS } from './shared';

export function mapPropertyToFHIR(property: Property, scan_id: string): Observation {
  const display = property.label ?? `Property ${property.property_path}`;

  const observation = createObservation({
    category: CATEGORY.EXAM,
    code: { system: SYSTEMS.VITRONIC, code: property.property_path, display },
    patientReference: `Scan/${scan_id}`,
    ...resolvePropertyValue(property.value)
  });

  return applyCommonFields(observation, property, SYSTEMS.VITRONIC);
}

export function mapPropertyListToFHIR(properties: PropertyList, scan_id: string): Observation[] {
  return properties.map((property) => mapPropertyToFHIR(property, scan_id));
}

function resolvePropertyValue(value: unknown): {
  valueQuantity?: { value: number };
  valueBoolean?: boolean;
  valueString?: string;
} {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { valueQuantity: { value } };
  }
  if (typeof value === 'boolean') {
    return { valueBoolean: value };
  }
  if (typeof value === 'string') {
    return { valueString: value };
  }
  if (value === null || value === undefined) {
    return {};
  }
  return { valueString: JSON.stringify(value) };
}
