import type { Observation, Patient } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import type { OuraPersonal } from '../../api/schemas/personal';
import { mapOuraPersonalToFHIR } from '../../fhir/mappers/personal';

describe('mapOuraPersonalToFHIR', () => {
  const currentYear = new Date().getFullYear();
  const mockPersonalData: OuraPersonal = {
    id: 'oura-12345',
    age: 30,
    weight: 82.5,
    height: 1.85,
    biological_sex: 'Male',
    email: 'berk@example.com'
  };

  it('throws an error if no personal data is provided', () => {
    expect(() => mapOuraPersonalToFHIR(null as unknown as OuraPersonal)).toThrow(
      'No personal data available to map to FHIR.'
    );
  });

  it('maps a complete OuraPersonal object to a FHIR Bundle with 4 entries', () => {
    const result = mapOuraPersonalToFHIR(mockPersonalData);
    const entries = result.entry ?? [];

    expect(result.resourceType).toBe('Bundle');
    expect(result.type).toBe('collection');
    expect(entries).toHaveLength(4);

    const patientResource = entries[0].resource as Patient;
    expect(patientResource.resourceType).toBe('Patient');
    expect(patientResource.identifier?.[0]?.value).toBe('oura-12345');
    expect(patientResource.gender).toBe('male');
    expect(patientResource.birthDate).toBe((currentYear - 30 - 1).toString());

    const weightObservation = entries[1].resource as Observation;
    expect(weightObservation.resourceType).toBe('Observation');
    expect(weightObservation.code?.coding?.[0]?.code).toBe('29463-7');
    expect(weightObservation.valueQuantity?.value).toBe(82.5);
    expect(weightObservation.identifier).toContainEqual({ system: 'email', value: 'berk@example.com' });

    const heightObservation = entries[2].resource as Observation;
    expect(heightObservation.resourceType).toBe('Observation');
    expect(heightObservation.code?.coding?.[0]?.code).toBe('8302-2');
    expect(heightObservation.valueQuantity?.value).toBe(1.85);

    const sexObservation = entries[3].resource as Observation;
    expect(sexObservation.resourceType).toBe('Observation');
    expect(sexObservation.code?.coding?.[0]?.code).toBe('99501-9');
    expect(sexObservation.valueString).toBe('Male');
  });

  it('generates only the Patient resource when optional metrics are missing', () => {
    const mockPartialData: OuraPersonal = {
      id: 'oura-67890'
    };

    const result = mapOuraPersonalToFHIR(mockPartialData);
    const entries = result.entry ?? [];

    expect(entries).toHaveLength(1);

    const patientResource = entries[0].resource as Patient;
    expect(patientResource.resourceType).toBe('Patient');
    expect(patientResource.gender).toBeUndefined();
    expect(patientResource.birthDate).toBeUndefined();
  });

  it('maps an unhandled biological sex value to "unknown" in the Patient resource', () => {
    const mockDataWithUnknownSex: OuraPersonal = {
      id: 'oura-11111',
      biological_sex: 'NotSpecified'
    };

    const result = mapOuraPersonalToFHIR(mockDataWithUnknownSex);
    const entries = result.entry ?? [];

    const patientResource = entries[0].resource as Patient;
    expect(patientResource.gender).toBe('unknown');

    const sexObservation = entries[1].resource as Observation;
    expect(sexObservation.valueString).toBe('NotSpecified');
  });
});
