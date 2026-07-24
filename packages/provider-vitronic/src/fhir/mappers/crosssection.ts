import type { Observation } from 'fhir/r4';
import type { CrossSection, CrossSectionList } from '../../api/schemas/crosssection';
import { applyCommonFields, CATEGORY, compact, createObservation, numericComponent, SYSTEMS } from './shared';

export function mapCrossSectionToFHIR(crossSection: CrossSection, scan_id: string): Observation {
  const display = crossSection.label ?? `Cross Section ${crossSection.crosssection_path}`;

  const observation = createObservation({
    category: CATEGORY.EXAM,
    code: { system: SYSTEMS.VITRONIC, code: crossSection.crosssection_path, display },
    patientReference: `Scan/${scan_id}`,
    valueQuantity: {
      value: crossSection.areas?.convex_area,
      unit: 'square meter',
      system: SYSTEMS.UCUM,
      code: 'm2'
    },
    components: compact([
      numericComponent(
        {
          system: SYSTEMS.VITRONIC,
          code: `${crossSection.areas?.convex_area}`,
          display: `${display} (Convex Area)`
        },
        crossSection.areas?.convex_area,
        { unit: 'meter', system: SYSTEMS.UCUM, code: 'm' }
      ),
      numericComponent(
        {
          system: SYSTEMS.VITRONIC,
          code: `${crossSection.areas?.perimeter_area}`,
          display: `${display} (Perimeter Area)`
        },
        crossSection.areas?.perimeter_area,
        { unit: 'meter', system: SYSTEMS.UCUM, code: 'm' }
      ),
      numericComponent(
        {
          system: SYSTEMS.VITRONIC,
          code: `${crossSection.circumferences.convex_circumference}`,
          display: `${display} (Convex Circumference)`
        },
        crossSection.circumferences.convex_circumference,
        { unit: 'meter', system: SYSTEMS.UCUM, code: 'm' }
      ),
      numericComponent(
        {
          system: SYSTEMS.VITRONIC,
          code: `${crossSection.circumferences.perimeter_circumference}`,
          display: `${display} (Perimeter Circumference)`
        },
        crossSection.circumferences.perimeter_circumference,
        { unit: 'meter', system: SYSTEMS.UCUM, code: 'm' }
      )
    ])
  });

  return applyCommonFields(observation, crossSection, SYSTEMS.VITRONIC);
}

export function mapCrossSectionListToFHIR(crossSections: CrossSectionList, scan_id: string): Observation[] {
  return crossSections.map((crossSection) => mapCrossSectionToFHIR(crossSection, scan_id));
}
