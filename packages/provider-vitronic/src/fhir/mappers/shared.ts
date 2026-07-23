import type { CodeableConcept, Observation, Quantity } from 'fhir/r4';
import type { CommonType } from '../../api/schemas/common';

export const SYSTEMS = {
  LOINC: 'http://loinc.org',
  UCUM: 'http://unitsofmeasure.org',
  SNOMED: 'http://snomed.info/sct',
  OBSERVATION_CATEGORY: 'http://terminology.hl7.org/CodeSystem/observation-category',
  VITRONIC: 'https://www.vitronic.com/bodyloop/measurements'
} as const;

export const CATEGORY = {
  EXAM: { code: 'exam', display: 'Exam' }
} as const;

export const PATIENT_REFERENCE = 'Patient/example';

export interface CodingInput {
  system: string;
  code: string;
  display?: string;
}

function toCoding(coding: CodingInput) {
  return {
    system: coding.system,
    code: coding.code,
    ...(coding.display ? { display: coding.display } : {})
  };
}

export function codeableConcept(coding: CodingInput): CodeableConcept {
  return { coding: [toCoding(coding)] };
}

export function numericComponent(
  coding: CodingInput,
  value?: number | null,
  quantity?: Omit<Quantity, 'value'>
): NonNullable<Observation['component']>[number] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return {
    code: codeableConcept(coding),
    valueQuantity: { value, ...quantity }
  };
}

export function stringComponent(
  coding: CodingInput,
  value?: string | null
): NonNullable<Observation['component']>[number] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return {
    code: codeableConcept(coding),
    valueString: value
  };
}

export function compact<T>(items: (T | undefined)[]): T[] {
  return items.filter((item): item is T => item !== undefined);
}

interface CreateObservationInput {
  code: CodingInput;
  category?: { code: string; display: string };
  valueQuantity?: Quantity;
  valueString?: string;
  valueBoolean?: boolean;
  components?: Observation['component'];
  patientReference?: string;
}

export function createObservation(input: CreateObservationInput): Observation {
  const observation: Observation = {
    resourceType: 'Observation',
    status: 'final',
    code: codeableConcept(input.code),
    subject: { reference: input.patientReference ?? PATIENT_REFERENCE }
  };

  if (input.category) {
    observation.category = [
      {
        coding: [
          {
            system: SYSTEMS.OBSERVATION_CATEGORY,
            code: input.category.code,
            display: input.category.display
          }
        ]
      }
    ];
  }

  if (input.valueQuantity) {
    observation.valueQuantity = input.valueQuantity;
  }

  if (input.valueString !== undefined) {
    observation.valueString = input.valueString;
  }

  if (input.valueBoolean !== undefined) {
    observation.valueBoolean = input.valueBoolean;
  }

  if (input.components && input.components.length > 0) {
    observation.component = input.components;
  }

  return observation;
}

export function applyCommonFields(observation: Observation, common: CommonType, identifierSystem: string): Observation {
  if (common.note) {
    observation.note = [{ text: common.note }];
  }

  if (common.key_external) {
    observation.identifier = [{ system: identifierSystem, value: common.key_external }];
  }

  return observation;
}
