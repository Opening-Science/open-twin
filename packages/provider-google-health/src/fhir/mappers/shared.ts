import type { CodeableConcept, Observation, Period, Quantity } from 'fhir/r4';
import type { health_v4 } from 'googleapis';

export const SYSTEMS = {
  LOINC: 'http://loinc.org',
  UCUM: 'http://unitsofmeasure.org',
  SNOMED: 'http://snomed.info/sct',
  OBSERVATION_CATEGORY: 'http://terminology.hl7.org/CodeSystem/observation-category',
  GOOGLE_HEALTH: 'https://developers.google.com/health/data-types'
} as const;

export const CATEGORY = {
  VITAL_SIGNS: { code: 'vital-signs', display: 'Vital Signs' },
  ACTIVITY: { code: 'activity', display: 'Activity' }
} as const;

export const PATIENT_REFERENCE = 'Patient/example';

interface CodingInput {
  system: string;
  code: string;
  display?: string;
}

export function toNumber(value?: string | number | null): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function dateToIsoString(date?: health_v4.Schema$Date): string | undefined {
  if (!date?.year || !date.month || !date.day) {
    return undefined;
  }
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

export function sampleTimeToDateTime(sampleTime?: health_v4.Schema$ObservationSampleTime): string | undefined {
  return sampleTime?.physicalTime ?? undefined;
}

export function intervalToPeriod(
  interval?: health_v4.Schema$ObservationTimeInterval | health_v4.Schema$SessionTimeInterval
): Period | undefined {
  if (!interval?.startTime && !interval?.endTime) {
    return undefined;
  }
  const period: Period = {};
  if (interval.startTime) {
    period.start = interval.startTime;
  }
  if (interval.endTime) {
    period.end = interval.endTime;
  }
  return period;
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
  value?: number,
  quantity?: Omit<Quantity, 'value'>
): NonNullable<Observation['component']>[number] | undefined {
  if (value === undefined) {
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
  effectiveDateTime?: string;
  effectivePeriod?: Period;
  valueQuantity?: Quantity;
  components?: Observation['component'];
}

export function createObservation(input: CreateObservationInput): Observation {
  const observation: Observation = {
    resourceType: 'Observation',
    status: 'final',
    code: codeableConcept(input.code),
    subject: { reference: PATIENT_REFERENCE }
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

  if (input.effectiveDateTime) {
    observation.effectiveDateTime = input.effectiveDateTime;
  }

  if (input.effectivePeriod) {
    observation.effectivePeriod = input.effectivePeriod;
  }

  if (input.valueQuantity) {
    observation.valueQuantity = input.valueQuantity;
  }

  if (input.components && input.components.length > 0) {
    observation.component = input.components;
  }

  return observation;
}
