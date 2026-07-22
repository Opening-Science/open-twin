import type { Observation } from 'fhir/r4';
import type { Property, PropertyList } from '../../api/schemas/properties';
import { applyCommonFields, CATEGORY, createObservation, SYSTEMS } from './shared';

export function mapPropertyToFHIR(property: Property): Observation {
  const display = property.label ?? `Property ${property.property_path}`;

  const observation = createObservation({
    category: CATEGORY.EXAM,
    code: { system: SYSTEMS.VITRONIC, code: property.property_path, display },
    ...resolvePropertyValue(property.value)
  });

  return applyCommonFields(observation, property, SYSTEMS.VITRONIC);
}

export function mapPropertyListToFHIR(properties: PropertyList): Observation[] {
  return properties.map(mapPropertyToFHIR);
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
